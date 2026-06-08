import { getApprovedUser, getFieldUser, createAnonymousUser, setUserName } from './_lib/db.js';
import { sendText } from './_lib/whatsapp.js';

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
          const text = message.text?.body?.trim() ?? '';

          // 1. Approved user → main menu (add features here later)
          const approved = await getApprovedUser(phone);
          if (approved) {
            await sendText(phone, `שלום ${approved.name}! המערכת עובדת. בקרוב יתווספו כאן אפשרויות נוספות.`);
            continue;
          }

          const user = await getFieldUser(phone);

          // 2. Registered, waiting for approval
          if (user && user.name) {
            await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
            continue;
          }

          // 3. We asked for their name (phone exists, name is null) — save whatever they typed
          if (user && !user.name && text) {
            await setUserName(phone, text);
            await sendText(phone, 'הינך רשום אך עדיין לא מאושר להשתמש במערכת');
            continue;
          }

          // 4. Completely unknown phone — first contact
          await createAnonymousUser(phone);
          await sendText(phone, 'אינך רשום במערכת בבקשה הכנס שם מלא');
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }

  return res.status(200).send('EVENT_RECEIVED');
}
