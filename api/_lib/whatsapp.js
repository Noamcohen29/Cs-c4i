const PHONE_ID = '1039050632632559';

async function post(body) {
  const token = process.env.WHATSAPP_TOKEN;
  await fetch(`https://graph.facebook.com/v25.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body })
  });
}

export async function sendText(to, text) {
  await post({ to, type: 'text', text: { body: text } });
}
