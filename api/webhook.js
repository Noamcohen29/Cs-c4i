import {
  addTicketComment,
  createInvoiceSubmission,
  createMissionStatusUpdate,
  createPendingFieldUser,
  createTaskReport,
  getPendingFieldUser,
  getUserByPhone,
  getUserSessionState,
  getUserTickets,
  getTicketsByIds,
  getEmployeeTasks,
  getTaskWithReports,
  isSerialNumberValid,
  setUserSession
} from './_lib/db.js';
import { handleMenuAction } from './_lib/menus.js';
import {
  sendCategoryList,
  sendProductList,
  sendSubmitOrAddButtons,
  sendTaskSelectionList,
  sendTicketActionButtons,
  sendTicketMenu,
  sendWhatsAppText
} from './_lib/whatsapp.js';
import { isEmployeeUser } from './_lib/localization.js';
import { uploadWhatsAppMediaToBlob } from './_lib/media.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === '123456') {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Forbidden');
    }
  }

  else if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      if (payload.object === 'whatsapp_business_account' && payload.entry) {
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              const value = change.value;

              if (value.messages && value.messages.length > 0) {
                const message = value.messages[0];

                // Ignore messages older than 30 seconds (WhatsApp retries)
                const msgTimestamp = parseInt(message.timestamp) * 1000;
                if (Date.now() - msgTimestamp > 30000) continue;

                const senderPhone = message.from;
                const userData = await getUserByPhone(senderPhone);
                const pendingUser = !userData ? await getPendingFieldUser(senderPhone) : null;

                // --- REGISTRATION GATE ---
                if (!userData) {
                  if (pendingUser) {
                    await sendWhatsAppText(senderPhone,
                      `⏳ שלום *${pendingUser.name}*! הרישום שלך עדיין ממתין לאישור מנהל.\nאנא המתן. 🙏`
                    );
                    continue;
                  }

                  // New user — two-step: ask name, then save
                  const sessionState = await getUserSessionState(senderPhone);
                  const textBody = message.text ? message.text.body.trim() : '';

                  if (sessionState === 'AWAITING_REG_NAME' && textBody) {
                    await createPendingFieldUser(senderPhone, textBody);
                    await setUserSession(senderPhone, 'IDLE');
                    await sendWhatsAppText(senderPhone,
                      `✅ תודה *${textBody}*!\n\nהרישום שלך נשלח ומחכה לאישור מנהל.\nתוכל להשתמש במערכת לאחר האישור. 🙏`
                    );
                    continue;
                  }

                  await setUserSession(senderPhone, 'AWAITING_REG_NAME');
                  await sendWhatsAppText(senderPhone, `👋 שלום! אני מערכת CS C4I.\n\nאנא הקלד את *שמך המלא*:`);
                  continue;
                }

                // --- 1. INTERACTIVE MESSAGE HANDLING ---
                if (message.type === 'interactive') {
                  const interactiveType = message.interactive.type;
                  
                  // A. User clicked a BUTTON
                  if (interactiveType === 'button_reply') {
                    const buttonId = message.interactive.button_reply.id;
                    const sessionState = await getUserSessionState(senderPhone);
                    await handleMenuAction(buttonId, senderPhone, userData, sessionState);
                  }
                  
                  // B. User selected an item from a LIST MENU
                  else if (interactiveType === 'list_reply') {
                    const listId = message.interactive.list_reply.id;
                    const listTitle = message.interactive.list_reply.title;
                    const sessionState = await getUserSessionState(senderPhone);
                    
                    if (listId === 'action_open_ticket' || listId === 'action_check_status' || listId === 'action_submit_invoice' || listId === 'action_mission_status' || listId === 'action_report_task' || listId === 'action_view_tasks_summary') {
                      await handleMenuAction(listId, senderPhone, userData, sessionState);
                    }
                    // 0. If they tapped a task from the task selection list
                    else if (listId.startsWith('task_select_')) {
                      const taskId = parseInt(listId.replace('task_select_', ''));
                      const task = await getTaskWithReports(taskId, senderPhone);
                      if (!task) {
                        await sendWhatsAppText(senderPhone, `❌ Task #${taskId} not found or not assigned to you.`);
                      } else {
                        const due = new Date(task.due_date).toISOString().split('T')[0];
                        const statusIcon = task.status === 'DONE' ? '🟢' : task.status === 'IN_PROGRESS' ? '🟡' : '🔴';
                        let msg = `🛠️ *Task #${task.task_id}*\n${statusIcon} *Status:* ${task.status}\n📅 *Due:* ${due}\n────────────────────\n*${task.title}*\n${task.description || ''}`;
                        if (task.reports && task.reports.length > 0) {
                          msg += `\n────────────────────\n📝 *Previous Reports (${task.reports.length}):*`;
                          task.reports.slice(-3).forEach((r, i) => {
                            const rDate = new Date(r.created_at).toLocaleString('en-GB');
                            msg += `\n\n[${i+1}] ${rDate}\n${r.report_text}`;
                            if (r.new_status) msg += ` → _${r.new_status}_`;
                          });
                        } else {
                          msg += `\n────────────────────\n💭 No reports yet.`;
                        }
                        msg += '\n────────────────────\n💬 Type your update for this task:';
                        await setUserSession(senderPhone, `AWAITING_TASK_REPORT_TEXT|||${taskId}`);
                        await sendWhatsAppText(senderPhone, msg);
                      }
                    }
                    // 0b. Pagination — next page of tasks
                    else if (listId.startsWith('task_page_')) {
                      const page = parseInt(listId.replace('task_page_', ''));
                      const allTasks = await getEmployeeTasks(senderPhone);
                      await sendTaskSelectionList(senderPhone, allTasks, page);
                    }
                    // 1. If they picked a Product
                    else if (listId.startsWith('prod_')) {
                      await setUserSession(senderPhone, `AWAITING_SERIAL_NUMBER|||${listTitle}|||`); // 3rd param is empty string for accumulated items
                      await sendWhatsAppText(senderPhone, `🛠️ *Product:* ${listTitle}\n\nPlease type the *Serial Number (S/N)* of the specific part or system,\nor 📷 *send a photo* of the serial number label — your choice!`);
                    }
                    // 2. If they picked a Category
                    else if (listId.startsWith('cat_')) {
                      if (sessionState.startsWith('AWAITING_PROBLEM_CATEGORY|||')) {
                        const parts = sessionState.split('|||');
                        const selectedProduct = parts[1];
                        const accumulatedData = parts[2]; // existing previous devices
                        const currentSN = parts[3];
                        const photoUrl = parts[4] || '';
                        const problemCategory = listTitle;

                        await setUserSession(senderPhone, `DRAFTING_TICKET|||${selectedProduct}|||${accumulatedData}|||${currentSN}|||${problemCategory}|||${photoUrl}`);
                        await sendWhatsAppText(senderPhone, `🔢 *S/N:* ${currentSN}\n⚠️ *Category:* ${problemCategory}\n\nPlease type the specific problem description for this device:`);
                      }
                    }
                  }
                }

                // --- 2. STANDARD TEXT / MEDIA HANDLING ---
                const textBody = message.text ? message.text.body : '';

                if (message.type === 'image') {
                  const sessionState = await getUserSessionState(senderPhone);

                  if (sessionState.startsWith('AWAITING_SERIAL_NUMBER|||')) {
                    const imageInfo = message.image || {};
                    const uploadedUrl = await uploadWhatsAppMediaToBlob(imageInfo.id, imageInfo.mime_type, 'serials');
                    if (uploadedUrl) {
                      const parts = sessionState.split('|||');
                      const selectedProduct = parts[1];
                      const accumulatedData = parts[2];
                      await setUserSession(senderPhone, `AWAITING_SERIAL_NUMBER|||${selectedProduct}|||${accumulatedData}|||${uploadedUrl}`);
                      await sendWhatsAppText(senderPhone, `📸 Photo of serial number received!\n\nNow please *type the Serial Number (S/N)* to confirm:`);
                    } else {
                      await sendWhatsAppText(senderPhone, `⚠️ Could not save the photo. Please try again or just type the Serial Number:`);
                    }
                  }

                  if (sessionState === 'AWAITING_INVOICE_DETAILS') {
                    const imageInfo = message.image || {};
                    const mediaId = imageInfo.id;
                    const caption = imageInfo.caption || null;
                    const uploadedUrl = await uploadWhatsAppMediaToBlob(mediaId, imageInfo.mime_type);
                    const notesPayload = {
                      media_id: mediaId || null,
                      mime_type: imageInfo.mime_type || null,
                      sha256: imageInfo.sha256 || null,
                      caption,
                      blob_url: uploadedUrl || null
                    };
                    await createInvoiceSubmission(senderPhone, userData, JSON.stringify(notesPayload), uploadedUrl);
                    await setUserSession(senderPhone, 'IDLE');
                    await sendWhatsAppText(senderPhone, uploadedUrl
                      ? '✅ Invoice image received and saved.'
                      : '⚠️ Received the image, but failed to store it. Please try again.');
                    await sendTicketMenu(senderPhone, userData);
                  }

                  if (sessionState.startsWith('AWAITING_TASK_REPORT_FILE|||')) {
                    const parts = sessionState.split('|||');
                    const taskId = parts[1];
                    const reportText = parts[2];
                    const imageInfo = message.image || {};
                    const uploadedUrl = await uploadWhatsAppMediaToBlob(imageInfo.id, imageInfo.mime_type, 'task-reports');
                    await setUserSession(senderPhone, `AWAITING_TASK_REPORT_STATUS|||${taskId}|||${reportText}|||${uploadedUrl || ''}`);
                    await sendWhatsAppText(senderPhone, uploadedUrl
                      ? `📸 Photo attached!\n\n📌 *Update the task status:*\n\nReply with:\n  *1* — Keep as is\n  *2* — In Progress\n  *3* — Done`
                      : `⚠️ Could not save photo. Continuing without it.\n\n📌 *Update the task status:*\n\nReply with:\n  *1* — Keep as is\n  *2* — In Progress\n  *3* — Done`);
                  }
                }

                if (textBody) {
                  const sessionState = await getUserSessionState(senderPhone);

                    // A. Text is a Serial Number
                    if (sessionState.startsWith('AWAITING_SERIAL_NUMBER|||')) {
                      const parts = sessionState.split('|||');
                      const selectedProduct = parts[1];
                      const accumulatedData = parts[2];
                      const photoUrl = parts[3] || null; // photo of S/N label if sent
                      const serialNumber = textBody.trim().toUpperCase(); 

                      // Verify SN exists in database
                      const isValid = await isSerialNumberValid(serialNumber);
                      
                      if (!isValid) {
                        await sendWhatsAppText(senderPhone, `❌ The Serial Number *${serialNumber}* was not found in our database.\n\nPlease check the number and type it again:`);
                      } else {
                        // S/N is valid, move to Category selection (carry photo URL if present)
                        await setUserSession(senderPhone, `AWAITING_PROBLEM_CATEGORY|||${selectedProduct}|||${accumulatedData}|||${serialNumber}|||${photoUrl || ''}`);
                        await sendCategoryList(senderPhone);
                      }
                    } 
                    
                    // B. Text is the Problem Description
                    else if (sessionState.startsWith('DRAFTING_TICKET|||')) {
                      const parts = sessionState.split('|||');
                      const selectedProduct = parts[1];
                      let accumulatedData = parts[2];
                      const currentSN = parts[3];
                      const problemCategory = parts[4];
                      const photoUrl = parts[5] || '';
                      
                      // Format the new device entry (include photo URL if a serial label photo was sent)
                      const photoLine = photoUrl ? `[Serial Photo: ${photoUrl}]\n` : '';
                      const newItem = `-------------------\n[S/N: ${currentSN}]\n${photoLine}[Category: ${problemCategory}]\nIssue: ${textBody}\n`;
                      
                      // Append to accumulated data
                      accumulatedData = accumulatedData + "\n" + newItem;
                      
                      // Ask if they want to submit or add another
                      await setUserSession(senderPhone, `AWAITING_SUBMIT|||${selectedProduct}|||${accumulatedData}`);
                      await sendSubmitOrAddButtons(senderPhone);
                    } 
                    
                    else if (sessionState === 'AWAITING_TICKET_NUMBERS') {
                      const ids = textBody.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                      if (ids.length === 0) {
                        await sendWhatsAppText(senderPhone, '⚠️ Please enter valid ticket number(s), e.g. *10* or *10, 12*');
                      } else {
                        const found = await getTicketsByIds(senderPhone, ids);
                        if (!found || found.length === 0) {
                          await sendWhatsAppText(senderPhone, '❌ No tickets found for those numbers. Please check and try again.');
                        } else {
                          for (const t of found) {
                            const date = new Date(t.created_at).toLocaleDateString('en-GB');
                            const statusIcon = t.status === 'OPEN' ? '🟢' : '🔴';
                            // Clean description for display (strip photo URLs)
                            const cleanDesc = (t.description || '').replace(/\[Serial Photo: https?:\/\/[^\]]+\]\n?/g, '').trim();
                            let detail =
                              `🎫 *Ticket #${t.ticket_id}*\n` +
                              `${statusIcon} *Status:* ${t.status}\n` +
                              `📅 *Opened:* ${date}\n` +
                              `─────────────────────\n` +
                              `${cleanDesc}`;
                            if (t.serial_photo_urls) {
                              detail += `\n─────────────────────\n📷 *Serial photos attached:* ${t.serial_photo_urls.split('\n').length}`;
                            }
                            await sendWhatsAppText(senderPhone, detail);
                          }
                          await setUserSession(senderPhone, 'IDLE');
                          if (found.length === 1) {
                            await sendTicketActionButtons(senderPhone, found[0].ticket_id, found[0].status);
                          } else {
                            await sendTicketMenu(senderPhone, userData);
                          }
                        }
                      }
                    }

                    else if (sessionState === 'AWAITING_TASK_NUMBER') {
                      const taskId = parseInt(textBody.trim());
                      if (isNaN(taskId)) {
                        await sendWhatsAppText(senderPhone, '⚠️ Please type a valid task number.');
                      } else {
                        const task = await getTaskWithReports(taskId, senderPhone);
                        if (!task) {
                          await sendWhatsAppText(senderPhone, `❌ Task #${taskId} not found or not assigned to you.`);
                        } else {
                          const due = new Date(task.due_date).toISOString().split('T')[0];
                          const statusIcon = task.status === 'DONE' ? '🟢' : task.status === 'IN_PROGRESS' ? '🟡' : '🔴';
                          let msg = `🛠️ *Task #${task.task_id}*\n${statusIcon} *Status:* ${task.status}\n📅 *Due:* ${due}\n────────────────────\n*${task.title}*\n${task.description || ''}`;
                          if (task.reports && task.reports.length > 0) {
                            msg += `\n────────────────────\n📝 *Previous Reports (${task.reports.length}):*`;
                            task.reports.forEach((r, i) => {
                              const rDate = new Date(r.created_at).toLocaleString('en-GB');
                              msg += `\n\n[${i+1}] ${rDate}\n${r.report_text}`;
                              if (r.new_status) msg += ` → _${r.new_status}_`;
                            });
                          } else {
                            msg += `\n────────────────────\n💭 No reports yet.`;
                          }
                          msg += '\n────────────────────\n💬 Type your update for this task:';
                          await setUserSession(senderPhone, `AWAITING_TASK_REPORT_TEXT|||${taskId}`);
                          await sendWhatsAppText(senderPhone, msg);
                        }
                      }
                    }

                    else if (sessionState.startsWith('AWAITING_TASK_REPORT_TEXT|||')) {
                      const taskId = sessionState.split('|||')[1];
                      await setUserSession(senderPhone, `AWAITING_TASK_REPORT_FILE|||${taskId}|||${textBody.trim()}`);
                      await sendWhatsAppText(senderPhone, `📎 *Attach evidence (optional)*\n\nSend a photo as proof, or type *skip* to continue.`);
                    }

                    else if (sessionState.startsWith('AWAITING_TASK_REPORT_FILE|||')) {
                      const parts = sessionState.split('|||');
                      const taskId = parts[1];
                      const reportText = parts[2];
                      if (textBody.trim().toLowerCase() === 'skip') {
                        await setUserSession(senderPhone, `AWAITING_TASK_REPORT_STATUS|||${taskId}|||${reportText}|||`);
                        await sendWhatsAppText(senderPhone, `📌 *Update the task status:*\n\nReply with:\n  *1* — Keep as is\n  *2* — In Progress\n  *3* — Done`);
                      } else {
                        await sendWhatsAppText(senderPhone, `📎 Please send a *photo* as attachment, or type *skip* to continue without one.`);
                      }
                    }

                    else if (sessionState.startsWith('AWAITING_TASK_REPORT_STATUS|||')) {
                      const parts = sessionState.split('|||');
                      const taskId = parseInt(parts[1]);
                      const reportText = parts[2];
                      const photoUrl = parts[3] || null;
                      const choice = textBody.trim();
                      const statusMap = { '1': null, '2': 'IN_PROGRESS', '3': 'DONE' };
                      if (!statusMap.hasOwnProperty(choice)) {
                        await sendWhatsAppText(senderPhone, '⚠️ Please reply with 1, 2, or 3.');
                      } else {
                        const newStatus = statusMap[choice];
                        await createTaskReport(taskId, senderPhone, reportText, newStatus, photoUrl || null);
                        const statusLabel = newStatus || 'unchanged';
                        const photoNote = photoUrl ? '\n📎 Photo attached.' : '';
                        await setUserSession(senderPhone, 'IDLE');
                        await sendWhatsAppText(senderPhone, `✅ Report saved for Task #${taskId}.\nStatus: *${statusLabel}*${photoNote}`);
                        await sendTicketMenu(senderPhone, userData);
                      }
                    }

                    else if (sessionState === 'AWAITING_INVOICE_DETAILS') {
                      await sendWhatsAppText(senderPhone, '🧾 Please upload a photo of the invoice (not text).');
                    }

                    else if (sessionState.startsWith('AWAITING_TICKET_COMMENT|||')) {
                      const ticketId = parseInt(sessionState.split('|||')[1]);
                      await addTicketComment(senderPhone, ticketId, textBody.trim());
                      await setUserSession(senderPhone, 'IDLE');
                      await sendWhatsAppText(senderPhone, `✅ Comment added to Ticket *#${ticketId}*.`);
                      await sendTicketMenu(senderPhone, userData);
                    }

                    else if (sessionState === 'AWAITING_MISSION_STATUS') {
                      const missionStatus = textBody.trim();
                      await createMissionStatusUpdate(senderPhone, missionStatus);
                      await setUserSession(senderPhone, 'IDLE');
                      await sendWhatsAppText(senderPhone, `✅ Mission status updated.\n\nUpdate received:\n${missionStatus}`);
                      await sendTicketMenu(senderPhone, userData);
                    }

                    else {
                      const openTickets = await getUserTickets(senderPhone);
                      const openCount = openTickets.filter(t => t.status === 'OPEN').length;
                      const ticketNote = openCount > 0
                        ? `📋 You have *${openCount}* open ticket${openCount > 1 ? 's' : ''}.`
                        : `✅ You have no open tickets.`;

                      let taskNote = '';
                      if (isEmployeeUser(userData)) {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const allTasks = await getEmployeeTasks(senderPhone);
                        const openTasks = allTasks.filter(t => t.status !== 'DONE');
                        const todayTasks = openTasks.filter(t => String(t.due_date).startsWith(todayStr));
                        taskNote = `\n🛠️ You have *${openTasks.length}* open task${openTasks.length !== 1 ? 's' : ''} (*${todayTasks.length}* due today).`;
                      }

                      const menuBody = `👋 Hello *${userData.name}*! I'm CS C4I Help Desk.\n\n${ticketNote}${taskNote}\n\nPlease select an action:`;
                      await sendTicketMenu(senderPhone, userData, menuBody);
                    }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('ERROR:', error.message);
    }
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    return res.status(405).send('Method Not Allowed');
  }
}

