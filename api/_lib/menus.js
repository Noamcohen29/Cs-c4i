import {
  createTaskReport,
  createTicket,
  createMissionStatusUpdate,
  closeTicket,
  reopenTicket,
  addTicketComment,
  getElbitProducts,
  getEmployeeTasks,
  getProjectManagerByCountry,
  getTaskWithReports,
  getUserTickets,
  getTicketsByIds,
  setUserSession,
  triggerRetoolWorkflow
} from './db.js';
import { sendProductList, sendTaskSelectionList, sendTicketMenu, sendWhatsAppText } from './whatsapp.js';

export async function handleMenuAction(actionId, senderPhone, userData, sessionState) {
  if (actionId.startsWith('action_close_ticket|||')) {
    const ticketId = parseInt(actionId.split('|||')[1]);
    await closeTicket(senderPhone, ticketId);
    await setUserSession(senderPhone, 'IDLE');
    await sendWhatsAppText(senderPhone, `✅ Ticket *#${ticketId}* has been closed.`);
    await sendTicketMenu(senderPhone, userData);
    return;
  }

  if (actionId.startsWith('action_reopen_ticket|||')) {
    const ticketId = parseInt(actionId.split('|||')[1]);
    await reopenTicket(senderPhone, ticketId);
    await setUserSession(senderPhone, 'IDLE');
    await sendWhatsAppText(senderPhone, `🔄 Ticket *#${ticketId}* has been reopened.`);
    await sendTicketMenu(senderPhone, userData);
    return;
  }

  if (actionId.startsWith('action_add_comment|||')) {
    const ticketId = parseInt(actionId.split('|||')[1]);
    await setUserSession(senderPhone, `AWAITING_TICKET_COMMENT|||${ticketId}`);
    await sendWhatsAppText(senderPhone, `💬 Type your comment for Ticket *#${ticketId}*:`);
    return;
  }

  if (actionId === 'action_view_tasks_summary') {
    const tasks = await getEmployeeTasks(senderPhone);
    await sendTaskSelectionList(senderPhone, tasks);
    return;
  }

  if (actionId === 'action_open_ticket') {
    const products = await getElbitProducts();
    if (products.length > 0) {
      await sendProductList(senderPhone, products);
      await setUserSession(senderPhone, 'AWAITING_PRODUCT_SELECTION');
    }
    return;
  }

  if (actionId === 'action_check_status') {
    const tickets = await getUserTickets(senderPhone);
    if (!tickets || tickets.length === 0) {
      await sendWhatsAppText(senderPhone, "You do not have any tickets yet.");
      return;
    }

    const open = tickets.filter(t => t.status === 'OPEN');
    const closed = tickets.filter(t => t.status !== 'OPEN');

    let msg = "🎫 *Your Tickets*\n";

    if (open.length > 0) {
      msg += "\n🟢 *Open*\n";
      open.forEach(t => {
        const date = new Date(t.created_at).toLocaleDateString('en-GB');
        msg += `  • *#${t.ticket_id}* — ${date}\n`;
      });
    }
    if (closed.length > 0) {
      msg += "\n🔴 *Closed*\n";
      closed.forEach(t => {
        const date = new Date(t.created_at).toLocaleDateString('en-GB');
        msg += `  • *#${t.ticket_id}* — ${date}\n`;
      });
    }

    msg += "\n─────────────────────\nType a ticket number to see full details.\nFor multiple tickets separate with a comma (e.g. *10, 12*)";

    await setUserSession(senderPhone, 'AWAITING_TICKET_NUMBERS');
    await sendWhatsAppText(senderPhone, msg);
    return;
  }

  if (actionId === 'action_add_another') {
    if (sessionState.startsWith('AWAITING_SUBMIT|||')) {
      const parts = sessionState.split('|||');
      const selectedProduct = parts[1];
      const accumulatedData = parts[2];

      await setUserSession(senderPhone, `AWAITING_SERIAL_NUMBER|||${selectedProduct}|||${accumulatedData}`);
      await sendWhatsAppText(senderPhone, `🛠️ *Product:* ${selectedProduct}\n\nPlease type the *Serial Number (S/N)* for the NEXT device,\nor 📷 *send a photo* of the serial number label — your choice!`);
    }
    return;
  }

  if (actionId === 'action_submit_ticket') {
    if (sessionState.startsWith('AWAITING_SUBMIT|||')) {
      const parts = sessionState.split('|||');
      const selectedProduct = parts[1];
      const finalDescription = parts[2];

      const pmInfo = await getProjectManagerByCountry(userData.country);
      const pmName = pmInfo ? pmInfo.pm_name : 'General Support Team';

      // Extract any serial photo URLs embedded in the description
      const photoMatches = finalDescription.match(/\[Serial Photo: (https?:\/\/[^\]]+)\]/g) || [];
      const serialPhotoUrls = photoMatches.length > 0
        ? photoMatches.map(m => m.replace('[Serial Photo: ', '').replace(']', '')).join('\n')
        : null;

      console.log(`Creating multi-device ticket for ${senderPhone}...`);
      const ticketId = await createTicket(senderPhone, finalDescription, serialPhotoUrls);

      // Build a clean summary from accumulated data (strip photo URL lines from display)
      const displayDescription = finalDescription
        .replace(/\[Serial Photo: https?:\/\/[^\]]+\]\n?/g, '')
        .trim();

      await setUserSession(senderPhone, 'IDLE');
      await sendWhatsAppText(senderPhone,
        `✅ *Ticket #${ticketId} Created!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Product:* ${selectedProduct}\n` +
        `*Assigned PM:* ${pmName}\n` +
        `*Status:* OPEN\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Devices logged:*\n${displayDescription}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `A technician will review it shortly.`
      );

      // Retool workflow with full enriched payload
      await triggerRetoolWorkflow({
        ticket_id: ticketId,
        phone: senderPhone,
        user_name: userData.name,
        pm_name: pmName,
        product: selectedProduct,
        description: displayDescription,
        serial_photo_urls: serialPhotoUrls || ''
      });
    }
    return;
  }

  if (actionId === 'action_submit_invoice') {
    await setUserSession(senderPhone, 'AWAITING_INVOICE_DETAILS');
    await sendWhatsAppText(senderPhone, '🧾 Please upload a photo of the invoice.');
    return;
  }

  if (actionId === 'action_report_task') {
    const tasks = await getEmployeeTasks(senderPhone);
    await sendTaskSelectionList(senderPhone, tasks);
    return;
  }

  if (actionId === 'action_mission_status') {
    await setUserSession(senderPhone, 'AWAITING_MISSION_STATUS');
    await sendWhatsAppText(senderPhone, '🛰️ Please type the mission status update (mission ID, current status, and notes).');
  }
}
