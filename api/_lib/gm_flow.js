import { getApprovedUsers, createTask, getSession, setSession } from './db.js';
import { sendText, sendList, sendButtons } from './whatsapp.js';

// ── Main GM Menu ──────────────────────────────────────────────────────────────

export async function sendGMMenu(phone, name) {
  await sendList(
    phone,
    `שלום ${name}! תפריט מנהל כללי`,
    'אנא בחר פעולה:',
    'בחר פעולה',
    [{
      title: 'פעולות',
      rows: [
        { id: 'gm_create_task',       title: 'הכנס משימה חדשה',        description: 'הוסף משימה לפי פורמט' },
        { id: 'gm_constraints_day',   title: 'אילוצים לפי יום',         description: 'צפייה באילוצים' },
        { id: 'gm_constraints_week',  title: 'אילוצים לשבוע',           description: 'שבוע נוכחי והבא' },
        { id: 'gm_tasks_today',       title: 'סטטוס משימות היום',       description: 'משימות להיום' },
        { id: 'gm_tasks_by_date',     title: 'משימות לפי תאריך',        description: 'חיפוש לפי תאריך' },
      ]
    }]
  );
}

// ── Menu action dispatcher ────────────────────────────────────────────────────

export async function handleGMAction(phone, user, actionId) {
  if (actionId === 'gm_create_task') {
    await setSession(phone, JSON.stringify({ flow: 'CREATE_TASK', step: 'DATE' }));
    await sendText(phone, '📅 הכנס תאריך המשימה בפורמט DD/MM/YYYY:');
    return;
  }
  // Remaining menu items — coming soon
  await sendText(phone, '⏳ תכונה זו תתווסף בקרוב.');
  await sendGMMenu(phone, user.name);
}

// ── Create-task multi-step flow ───────────────────────────────────────────────

export async function handleGMFlow(phone, user, sessionStr, message) {
  let session;
  try { session = JSON.parse(sessionStr); } catch { return; }

  const text    = message.text?.body?.trim() ?? '';
  const btnId   = message.interactive?.button_reply?.id ?? '';
  const listId  = message.interactive?.list_reply?.id ?? '';
  const action  = btnId || listId;

  if (session.flow === 'CREATE_TASK') {
    await handleCreateTask(phone, user, session, text, action);
  }
}

async function handleCreateTask(phone, user, session, text, action) {
  const save = (s) => setSession(phone, JSON.stringify(s));

  // ── Step 1: Date ─────────────────────────────────────────────────────────
  if (session.step === 'DATE') {
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      await sendText(phone, '⚠️ פורמט לא תקין. אנא הכנס תאריך בפורמט DD/MM/YYYY:');
      return;
    }
    const [, d, m, y] = match;
    session.date = `${y}-${m}-${d}`;
    session.step = 'TOPIC';
    await save(session);
    await sendButtons(phone, '📂 בחר נושא המשימה:', [
      { id: 'topic_hosavot',     title: 'הסבות' },
      { id: 'topic_mefakeshot',  title: 'מפקדות' },
      { id: 'topic_taktic',      title: 'טקטי' }
    ]);
    return;
  }

  // ── Step 2: Topic ────────────────────────────────────────────────────────
  if (session.step === 'TOPIC') {
    const map = { topic_hosavot: 'הסבות', topic_mefakeshot: 'מפקדות', topic_taktic: 'טקטי' };
    if (!map[action]) { await sendText(phone, '⚠️ אנא בחר נושא מהאפשרויות.'); return; }
    session.topic = map[action];
    session.step  = 'CLIENT_NAME';
    await save(session);
    await sendText(phone, '👤 הכנס שם מנהל המשימה מצד הלקוח:');
    return;
  }

  // ── Step 3: Client name ──────────────────────────────────────────────────
  if (session.step === 'CLIENT_NAME') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס שם:'); return; }
    session.client_name = text;
    session.step = 'CLIENT_PHONE';
    await save(session);
    await sendText(phone, '📞 הכנס מספר טלפון מנהל המשימה מצד הלקוח:');
    return;
  }

  // ── Step 4: Client phone ─────────────────────────────────────────────────
  if (session.step === 'CLIENT_PHONE') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס מספר טלפון:'); return; }
    session.client_phone = text;
    session.step = 'DESCRIPTION';
    await save(session);
    await sendText(phone, '📝 הכנס תיאור המשימה:');
    return;
  }

  // ── Step 5: Description ──────────────────────────────────────────────────
  if (session.step === 'DESCRIPTION') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס תיאור:'); return; }
    session.description  = text;
    session.step         = 'MANAGER';
    session.tech_phones  = [];
    await save(session);
    await sendManagerList(phone, user.phone);
    return;
  }

  // ── Step 6: Pick one manager ─────────────────────────────────────────────
  if (session.step === 'MANAGER') {
    if (!action.startsWith('mgr_')) { await sendManagerList(phone, user.phone); return; }
    session.manager_phone = action.replace('mgr_', '');
    session.step = 'TECHS';
    await save(session);
    await sendTechList(phone, user.phone, session.manager_phone, []);
    return;
  }

  // ── Step 7: Pick one or more techs ──────────────────────────────────────
  if (session.step === 'TECHS') {
    if (action === 'tech_done') {
      const taskId = await createTask({
        task_date:    session.date,
        topic:        session.topic,
        client_name:  session.client_name,
        client_phone: session.client_phone,
        description:  session.description,
        manager_phone: session.manager_phone,
        tech_phones:  session.tech_phones.join(','),
        created_by:   phone
      });
      await setSession(phone, 'IDLE');
      const d = session.date.split('-').reverse().join('/');
      await sendText(phone,
        `✅ משימה #${taskId} נוצרה בהצלחה!\n\n` +
        `📅 תאריך: ${d}\n` +
        `📂 נושא: ${session.topic}\n` +
        `👤 מנהל לקוח: ${session.client_name} (${session.client_phone})\n` +
        `🛠️ טכנאים שנבחרו: ${session.tech_phones.length}`
      );
      return;
    }

    if (action.startsWith('tech_')) {
      const techPhone = action.replace('tech_', '');
      if (!session.tech_phones.includes(techPhone)) session.tech_phones.push(techPhone);
      await save(session);
      await sendTechList(phone, user.phone, session.manager_phone, session.tech_phones);
      return;
    }

    await sendTechList(phone, user.phone, session.manager_phone, session.tech_phones);
    return;
  }
}

// ── Helper: manager selection list ───────────────────────────────────────────

async function sendManagerList(phone, gmPhone) {
  const users = (await getApprovedUsers()).filter(u => u.phone !== gmPhone);
  if (users.length === 0) {
    await sendText(phone, '⚠️ אין משתמשים מאושרים לבחירה כמנהל. אנא אשר משתמשים נוספים תחילה.');
    return;
  }
  const rows = users.slice(0, 10).map(u => ({
    id:          `mgr_${u.phone}`,
    title:       u.name.substring(0, 24),
    description: u.role ?? 'TECH'
  }));
  await sendList(phone, 'בחירת מנהל משימה', 'בחר מנהל משימה מהרשימה:', 'בחר מנהל', [{ title: 'משתמשים', rows }]);
}

// ── Helper: tech selection list ───────────────────────────────────────────────

async function sendTechList(phone, gmPhone, managerPhone, selectedPhones) {
  const users = (await getApprovedUsers()).filter(
    u => u.phone !== gmPhone && u.phone !== managerPhone && !selectedPhones.includes(u.phone)
  );

  const doneRow = {
    id:          'tech_done',
    title:       '✅ סיום בחירה',
    description: selectedPhones.length > 0 ? `${selectedPhones.length} טכנאים נבחרו` : 'המשך ללא טכנאים'
  };

  const techRows = users.slice(0, 9).map(u => ({
    id:          `tech_${u.phone}`,
    title:       u.name.substring(0, 24),
    description: u.role ?? 'TECH'
  }));

  const selectedNote = selectedPhones.length > 0 ? `✅ נבחרו ${selectedPhones.length} טכנאים\n\n` : '';
  await sendList(
    phone,
    'בחירת טכנאים',
    `${selectedNote}בחר טכנאי נוסף או סיים:`,
    'בחר',
    [{ title: 'אפשרויות', rows: [doneRow, ...techRows] }]
  );
}
