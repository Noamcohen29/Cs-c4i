import { getApprovedUser, getPendingUser, registerUser, getSession, setSession } from './_lib/db.js';
import { sendText } from './_lib/whatsapp.js';

export default async function handler(req, res) {
  // Webhook verification
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === '123456') return res.status(200).send(challenge);
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const entries = req.body?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];

        for (const message of messages) {
          // Ignore retries older than 30 seconds
          if (Date.now() - parseInt(message.timestamp) * 1000 > 30000) continue;

          const phone = message.from;
          const text = message.text?.body?.trim() ?? '';

          const approved = await getApprovedUser(phone);

          // ✅ Approved user — show main menu (placeholder for future features)
          if (approved) {
            await sendText(phone, `שלום ${approved.name}! המערכת עובדת. בקרוב יתווספו כאן אפשרויות נוספות.`);
            continue;
          }

          const pending = await getPendingUser(phone);

          // 🕐 Registered but waiting for manager approval
          if (pending) {
            await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
            continue;
          }

          // ❌ Unknown user — registration flow
          const session = await getSession(phone);

          if (session === 'AWAITING_REG_NAME' && text) {
            await registerUser(phone, text);
            await setSession(phone, 'IDLE');
            await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
            continue;
          }

          await setSession(phone, 'AWAITING_REG_NAME');
          await sendText(phone, 'אינך רשום במערכת בבקשה הכנס שם מלא');
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }

  return res.status(200).send('EVENT_RECEIVED');
}
