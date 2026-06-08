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

// sections: [{ title, rows: [{ id, title, description? }] }]
export async function sendList(to, header, body, buttonText, sections) {
  await post({
    to, type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
      body: { text: body },
      action: { button: buttonText, sections }
    }
  });
}

// buttons: [{ id, title }]  — max 3
export async function sendButtons(to, body, buttons) {
  await post({
    to, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }))
      }
    }
  });
}
