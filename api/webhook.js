import { getApprovedUser, getFieldUser, createAnonymousUser, setUserName, getSession, setSession } from './_lib/db.js';
import { sendText } from './_lib/whatsapp.js';
import { sendGMMenu, handleGMAction, handleGMFlow } from './_lib/gm_flow.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === '123456') return res.status(200).send(challenge);
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    for (const entry of req.body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) {
          if (Date.now() - parseInt(message.timestamp) * 1000 > 30000) continue;

          const phone = message.from;
          const text  = message.text?.body?.trim() ?? '';

          // ── Registration gate ──────────────────────────────────────────
          const approved = await getApprovedUser(phone);

          if (!approved) {
            const user = await getFieldUser(phone);

            if (user && user.name) {
              await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
              continue;
            }
            if (user && !user.name && text) {
              await setUserName(phone, text);
              await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
              continue;
            }
            await createAnonymousUser(phone);
            await sendText(phone, 'אינך רשום במערכת בבקשה הכנס שם מלא');
            continue;
          }

          // ── Approved user ──────────────────────────────────────────────
          const session = await getSession(phone);
          const btnId  = message.interactive?.button_reply?.id ?? '';
          const listId = message.interactive?.list_reply?.id ?? '';
          const action = btnId || listId;

          // If user is in an active flow — continue it
          if (session !== 'IDLE') {
            await handleGMFlow(phone, approved, session, message);
            continue;
          }

          // Menu item tapped
          if (action.startsWith('gm_')) {
            await handleGMAction(phone, approved, action);
            continue;
          }

          // Default: show role-based main menu
          if (approved.role === 'GM') {
            await sendGMMenu(phone, approved.name);
          } else {
            await sendText(phone, `שלום ${approved.name}! תפריט טכנאי יתווסף בקרוב.`);
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }

  return res.status(200).send('EVENT_RECEIVED');
}
