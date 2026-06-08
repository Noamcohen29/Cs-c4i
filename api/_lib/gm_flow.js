import { getApprovedUsers, createTask, getActiveTasks, getTaskById, cancelTask, cancelTaskDay, getSession, setSession } from './db.js';
import { sendText, sendList, sendButtons } from './whatsapp.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(str) {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

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
        { id: 'gm_create_task',      title: 'הכנס משימה חדשה',       description: 'הוסף משימה לפי פורמט' },
        { id: 'gm_update_task',      title: 'עדכון / ביטול משימה',    description: 'שנה פרטים, בטל יום או משימה' },
        { id: 'gm_constraints_day',  title: 'אילוצים לפי יום',        description: 'צפייה באילוצים' },
        { id: 'gm_constraints_week', title: 'אילוצים לשבוע',          description: 'שבוע נוכחי והבא' },
        { id: 'gm_tasks_today',      title: 'סטטוס משימות היום',      description: 'משימות להיום' },
        { id: 'gm_tasks_by_date',    title: 'משימות לפי תאריך',       description: 'חיפוש לפי תאריך' },
      ]
    }]
  );
}

// ── Menu action dispatcher ────────────────────────────────────────────────────

export async function handleGMAction(phone, user, actionId) {
  if (actionId === 'gm_create_task') {
    await setSession(phone, JSON.stringify({ flow: 'CREATE_TASK', step: 'START_DATE' }));
    await sendText(phone, '📅 הכנס תאריך *התחלה* של המשימה בפורמט DD/MM/YYYY:');
    return;
  }
  if (actionId === 'gm_update_task') {
    await setSession(phone, JSON.stringify({ flow: 'UPDATE_TASK', step: 'SELECT' }));
    await sendTaskSelectList(phone);
    return;
  }
  await sendText(phone, '⏳ תכונה זו תתווסף בקרוב.');
  await sendGMMenu(phone, user.name);
}

// ── Flow router ───────────────────────────────────────────────────────────────

export async function handleGMFlow(phone, user, sessionStr, message) {
  let session;
  try { session = JSON.parse(sessionStr); } catch { return; }

  const text   = message.text?.body?.trim() ?? '';
  const btnId  = message.interactive?.button_reply?.id ?? '';
  const listId = message.interactive?.list_reply?.id ?? '';
  const action = btnId || listId;

  if (session.flow === 'CREATE_TASK') await handleCreateTask(phone, user, session, text, action);
  if (session.flow === 'UPDATE_TASK') await handleUpdateTask(phone, user, session, text, action);
}

// ── CREATE TASK flow ──────────────────────────────────────────────────────────

async function handleCreateTask(phone, user, session, text, action) {
  const save = (s) => setSession(phone, JSON.stringify(s));

  if (session.step === 'START_DATE') {
    const iso = parseDate(text);
    if (!iso) { await sendText(phone, '⚠️ פורמט לא תקין. אנא הכנס DD/MM/YYYY:'); return; }
    session.start_date = iso;
    session.step = 'END_DATE';
    await save(session);
    await sendText(phone, '📅 הכנס תאריך *סיום* של המשימה בפורמט DD/MM/YYYY\n(או שלח *דילוג* אם המשימה ביום אחד):');
    return;
  }

  if (session.step === 'END_DATE') {
    if (text.toLowerCase() === 'דילוג' || text.toLowerCase() === 'skip') {
      session.end_date = null;
    } else {
      const iso = parseDate(text);
      if (!iso) { await sendText(phone, '⚠️ פורמט לא תקין. הכנס DD/MM/YYYY או שלח *דילוג*:'); return; }
      session.end_date = iso;
    }
    session.step = 'TOPIC';
    await save(session);
    await sendButtons(phone, '📂 בחר נושא המשימה:', [
      { id: 'topic_hosavot',    title: 'הסבות' },
      { id: 'topic_mefakeshot', title: 'מפקדות' },
      { id: 'topic_taktic',     title: 'טקטי' }
    ]);
    return;
  }

  if (session.step === 'TOPIC') {
    const map = { topic_hosavot: 'הסבות', topic_mefakeshot: 'מפקדות', topic_taktic: 'טקטי' };
    if (!map[action]) { await sendText(phone, '⚠️ אנא בחר נושא מהאפשרויות.'); return; }
    session.topic = map[action];
    session.step  = 'CLIENT_NAME';
    await save(session);
    await sendText(phone, '👤 הכנס שם מנהל המשימה מצד הלקוח:');
    return;
  }

  if (session.step === 'CLIENT_NAME') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס שם:'); return; }
    session.client_name = text;
    session.step = 'CLIENT_PHONE';
    await save(session);
    await sendText(phone, '📞 הכנס מספר טלפון מנהל המשימה מצד הלקוח:');
    return;
  }

  if (session.step === 'CLIENT_PHONE') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס מספר טלפון:'); return; }
    session.client_phone = text;
    session.step = 'DESCRIPTION';
    await save(session);
    await sendText(phone, '📝 הכנס תיאור המשימה:');
    return;
  }

  if (session.step === 'DESCRIPTION') {
    if (!text) { await sendText(phone, '⚠️ אנא הכנס תיאור:'); return; }
    session.description = text;
    session.step = 'MANAGER';
    session.tech_phones = [];
    await save(session);
    await sendManagerList(phone, user.phone);
    return;
  }

  if (session.step === 'MANAGER') {
    if (!action.startsWith('mgr_')) { await sendManagerList(phone, user.phone); return; }
    session.manager_phone = action.replace('mgr_', '');
    session.step = 'TECHS';
    await save(session);
    await sendTechList(phone, user.phone, session.manager_phone, []);
    return;
  }

  if (session.step === 'TECHS') {
    if (action === 'tech_done') {
      const taskId = await createTask({
        task_date:     session.start_date,
        end_date:      session.end_date,
        topic:         session.topic,
        client_name:   session.client_name,
        client_phone:  session.client_phone,
        description:   session.description,
        manager_phone: session.manager_phone,
        tech_phones:   session.tech_phones.join(','),
        created_by:    phone
      });
      await setSession(phone, 'IDLE');
      const dateRange = session.end_date
        ? `${fmtDate(session.start_date)} — ${fmtDate(session.end_date)}`
        : fmtDate(session.start_date);
      await sendText(phone,
        `✅ משימה #${taskId} נוצרה בהצלחה!\n\n` +
        `📅 תאריכים: ${dateRange}\n` +
        `📂 נושא: ${session.topic}\n` +
        `👤 מנהל לקוח: ${session.client_name} (${session.client_phone})\n` +
        `🛠️ טכנאים: ${session.tech_phones.length}`
      );
      return;
    }
    if (action.startsWith('tech_')) {
      const t = action.replace('tech_', '');
      if (!session.tech_phones.includes(t)) session.tech_phones.push(t);
      await save(session);
      await sendTechList(phone, user.phone, session.manager_phone, session.tech_phones);
      return;
    }
    await sendTechList(phone, user.phone, session.manager_phone, session.tech_phones);
    return;
  }
}

// ── UPDATE / CANCEL TASK flow ─────────────────────────────────────────────────

async function handleUpdateTask(phone, user, session, text, action) {
  const save = (s) => setSession(phone, JSON.stringify(s));

  // Step 1: pick a task from the list
  if (session.step === 'SELECT') {
    if (!action.startsWith('edit_task_')) { await sendTaskSelectList(phone); return; }
    const taskId = parseInt(action.replace('edit_task_', ''));
    const task = await getTaskById(taskId);
    if (!task) { await sendText(phone, '⚠️ משימה לא נמצאה.'); return; }
    session.task_id = taskId;
    session.step    = 'ACTION';
    await save(session);
    const dateRange = task.end_date
      ? `${fmtDate(task.task_date)} — ${fmtDate(task.end_date)}`
      : fmtDate(task.task_date);
    await sendButtons(phone,
      `📋 *משימה #${taskId}*\n📅 ${dateRange}\n📂 ${task.topic}\n👤 ${task.client_name}\n\nמה תרצה לעשות?`,
      [
        { id: 'update_cancel_day',  title: 'ביטול יום ספציפי' },
        { id: 'update_cancel_all',  title: 'ביטול המשימה כולה' },
        { id: 'update_back',        title: 'חזרה לתפריט' }
      ]
    );
    return;
  }

  // Step 2: choose action
  if (session.step === 'ACTION') {
    if (action === 'update_back') {
      await setSession(phone, 'IDLE');
      await sendGMMenu(phone, user.name);
      return;
    }
    if (action === 'update_cancel_all') {
      await cancelTask(session.task_id);
      await setSession(phone, 'IDLE');
      await sendText(phone, `✅ משימה #${session.task_id} בוטלה בהצלחה.`);
      await sendGMMenu(phone, user.name);
      return;
    }
    if (action === 'update_cancel_day') {
      session.step = 'CANCEL_DAY';
      await save(session);
      await sendText(phone, `📅 הכנס את התאריך לביטול בפורמט DD/MM/YYYY:`);
      return;
    }
    return;
  }

  // Step 3: cancel a specific day
  if (session.step === 'CANCEL_DAY') {
    const iso = parseDate(text);
    if (!iso) { await sendText(phone, '⚠️ פורמט לא תקין. אנא הכנס DD/MM/YYYY:'); return; }
    await cancelTaskDay(session.task_id, iso);
    await setSession(phone, 'IDLE');
    await sendText(phone, `✅ היום ${text} בוטל ממשימה #${session.task_id}.`);
    await sendGMMenu(phone, user.name);
    return;
  }
}

// ── Helper lists ──────────────────────────────────────────────────────────────

async function sendTaskSelectList(phone) {
  const tasks = await getActiveTasks();
  if (tasks.length === 0) {
    await sendText(phone, '⚠️ אין משימות פעילות כרגע.');
    return;
  }
  const rows = tasks.slice(0, 10).map(t => ({
    id:          `edit_task_${t.task_id}`,
    title:       `#${t.task_id} ${t.topic}`.substring(0, 24),
    description: `${fmtDate(t.task_date)}${t.end_date ? ' — '+fmtDate(t.end_date) : ''} | ${t.client_name ?? ''}`.substring(0, 72)
  }));
  await sendList(phone, 'עדכון / ביטול משימה', 'בחר משימה מהרשימה:', 'בחר משימה', [{ title: 'משימות', rows }]);
}

async function sendManagerList(phone, gmPhone) {
  const users = (await getApprovedUsers()).filter(u => u.phone !== gmPhone);
  if (users.length === 0) {
    await sendText(phone, '⚠️ אין משתמשים מאושרים לבחירה כמנהל.');
    return;
  }
  const rows = users.slice(0, 10).map(u => ({
    id:          `mgr_${u.phone}`,
    title:       u.name.substring(0, 24),
    description: u.role ?? 'TECH'
  }));
  await sendList(phone, 'בחירת מנהל משימה', 'בחר מנהל משימה מהרשימה:', 'בחר מנהל', [{ title: 'משתמשים', rows }]);
}

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
  const note = selectedPhones.length > 0 ? `✅ נבחרו ${selectedPhones.length} טכנאים\n\n` : '';
  await sendList(phone, 'בחירת טכנאים', `${note}בחר טכנאי נוסף או סיים:`, 'בחר', [{ title: 'אפשרויות', rows: [doneRow, ...techRows] }]);
}
