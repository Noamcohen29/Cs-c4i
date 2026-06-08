import { resolveLocale, getGreetingText, isApprovedStatus, isEmployeeUser } from './localization.js';

export async function sendWhatsAppText(toPhone, textBody) {
  const token = process.env.WHATSAPP_TOKEN; 
  const phoneNumberId = '1039050632632559'; 
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toPhone, type: 'text', text: { body: textBody } })
  });
}

export async function sendTicketMenu(toPhone, userData, bodyText = 'Please select an action:') {
  const token = process.env.WHATSAPP_TOKEN; 
  const phoneNumberId = '1039050632632559'; 
  const isEmployee = isEmployeeUser(userData);
  if (isEmployee) {
    await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: 'Select Action',
            sections: [
              {
                title: 'Employee Actions',
                rows: [
                  { id: 'action_open_ticket', title: '📝 Open Ticket' },
                  { id: 'action_check_status', title: '🔍 Check Status' },
                  { id: 'action_submit_invoice', title: '🧾 Submit Invoice' },
                  { id: 'action_mission_status', title: '🛰️ Add Mission Status' },
                  { id: 'action_report_task', title: '📋 Report on Task' },
                  { id: 'action_view_tasks_summary', title: '📊 Tasks Summary' }
                ]
              }
            ]
          }
        }
      })
    });
    return;
  }
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'action_open_ticket', title: '📝 Open Ticket' } },
            { type: 'reply', reply: { id: 'action_check_status', title: '🔍 Check Status' } }
          ]
        }
      }
    })
  });
}

export async function sendSubmitOrAddButtons(toPhone) {
  const token = process.env.WHATSAPP_TOKEN; 
  const phoneNumberId = '1039050632632559'; 
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `Device issue recorded! 📝\n\nWould you like to log another device/part, or submit this ticket now?` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'action_add_another', title: '➕ Add Another' } },
            { type: 'reply', reply: { id: 'action_submit_ticket', title: '✅ Submit Ticket' } }
          ]
        }
      }
    })
  });
}

export async function sendProductList(toPhone, products) {
  const token = process.env.WHATSAPP_TOKEN; 
  const phoneNumberId = '1039050632632559'; 
  const formattedRows = products.map(p => ({
    id: `prod_${p.product_id}`,
    title: p.product_name.substring(0, 24),
    description: p.category_name.substring(0, 72)
  }));
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'list', header: { type: 'text', text: 'System Diagnostics' },
        body: { text: 'Please select the C4I system:' }, footer: { text: 'CS C4I Help Desk' },
        action: { button: 'Select Product', sections: [{ title: 'C4I Systems', rows: formattedRows }] }
      }
    })
  });
}

export async function sendTaskSelectionList(toPhone, tasks, page = 0) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = '1039050632632559';
  const todayStr = new Date().toISOString().split('T')[0];

  const fmtDate = d => { try { return new Date(d).toISOString().split('T')[0]; } catch(e) { return '?'; } };
  const statusIcon = s => s === 'DONE' ? '🟢' : s === 'IN_PROGRESS' ? '🟡' : '🔴';

  // Sort: due today first, then by due_date ascending, done last
  const sorted = [...tasks].sort((a, b) => {
    if (a.status === 'DONE' && b.status !== 'DONE') return 1;
    if (a.status !== 'DONE' && b.status === 'DONE') return -1;
    const aToday = fmtDate(a.due_date) === todayStr ? 0 : 1;
    const bToday = fmtDate(b.due_date) === todayStr ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    return fmtDate(a.due_date).localeCompare(fmtDate(b.due_date));
  });

  const openTasks = sorted.filter(t => t.status !== 'DONE');
  const PAGE_SIZE = 9; // leave 1 slot for "Next Page" row
  const totalPages = Math.ceil(openTasks.length / PAGE_SIZE);
  const pageTasks = openTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasMore = (page + 1) < totalPages;

  if (sorted.length === 0) {
    await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: toPhone, type: 'text', text: { body: '✅ You have no tasks assigned to you right now.' } })
    });
    return;
  }

  const toRow = t => ({
    id: `task_select_${t.task_id}`,
    title: t.title.substring(0, 24),
    description: `${statusIcon(t.status)} ${t.status} — due ${fmtDate(t.due_date)}`
  });

  // Split page tasks into "Due Today" and "Upcoming" sub-sections
  const todayRows = pageTasks.filter(t => fmtDate(t.due_date) === todayStr).map(toRow);
  const otherRows = pageTasks.filter(t => fmtDate(t.due_date) !== todayStr).map(toRow);
  if (hasMore) otherRows.push({ id: `task_page_${page + 1}`, title: '➡️ Next Page', description: `Tasks ${(page+1)*PAGE_SIZE+1}–${Math.min((page+2)*PAGE_SIZE, openTasks.length)} of ${openTasks.length}` });

  const sections = [];
  if (todayRows.length > 0) sections.push({ title: '🔴 Due Today', rows: todayRows });
  if (otherRows.length > 0) sections.push({ title: page === 0 ? '📋 Open Tasks' : `📋 Open Tasks (p.${page+1})`, rows: otherRows });
  // Append done tasks only on last page
  if (!hasMore) {
    const doneRows = sorted.filter(t => t.status === 'DONE').slice(0, 5).map(toRow);
    if (doneRows.length > 0 && sections.length < 3) sections.push({ title: '🟢 Recently Done', rows: doneRows });
  }

  const pageLabel = totalPages > 1 ? ` — page ${page+1}/${totalPages}` : '';
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: `📋 Your Tasks (${openTasks.length} open${pageLabel})` },
        body: { text: 'Tap a task to view details and submit an update.\nSorted by due date — today first.' },
        footer: { text: 'CS C4I Help Desk' },
        action: { button: 'Select Task', sections }
      }
    })
  });
}

export async function sendCategoryList(toPhone) {
  const token = process.env.WHATSAPP_TOKEN; 
  const phoneNumberId = '1039050632632559'; 
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'What type of issue are you experiencing with this specific device?' },
        action: {
          button: 'Select Category',
          sections: [
            {
              title: 'Problem Categories',
              rows: [
                { id: 'cat_network', title: 'Network' },
                { id: 'cat_rf', title: 'RF (Radio Frequency)' },
                { id: 'cat_system', title: 'System / Core' },
                { id: 'cat_software', title: 'Software / OS' },
                { id: 'cat_hardware', title: 'Hardware Damage' },
                { id: 'cat_power', title: 'Power / Battery' }
              ]
            }
          ]
        }
      }
    })
  });
}

export async function sendTicketActionButtons(toPhone, ticketId, ticketStatus) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = '1039050632632559';
  const isOpen = ticketStatus === 'OPEN';
  const primaryButton = isOpen
    ? { type: 'reply', reply: { id: `action_close_ticket|||${ticketId}`, title: '🔒 Close Ticket' } }
    : { type: 'reply', reply: { id: `action_reopen_ticket|||${ticketId}`, title: '🔄 Reopen Ticket' } };
  await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: toPhone, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: `What would you like to do with Ticket *#${ticketId}*?` },
        action: {
          buttons: [
            primaryButton,
            { type: 'reply', reply: { id: `action_add_comment|||${ticketId}`, title: '💬 Add Comment' } }
          ]
        }
      }
    })
  });
}
