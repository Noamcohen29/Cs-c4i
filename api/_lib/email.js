import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// NOTE: On Resend free plan (no verified domain), only the account owner email works.
// Once elbitsystems.com domain is verified by IT, switch back to the elbit addresses.
const TICKET_RECIPIENTS = [
  'noam451@gmail.com'
];

export async function sendNewTicketEmail({ ticketId, userName, phone, pmName, selectedProduct, description, serialPhotoUrls }) {
  try {
    // Build serial photo rows HTML
    let photoSection = '';
    if (serialPhotoUrls) {
      const urls = serialPhotoUrls.split('\n').filter(Boolean);
      const photoRows = urls.map((url, i) => `
        <tr>
          <td style="padding: 10px 0;">
            <strong>📷 Serial Photo ${urls.length > 1 ? i + 1 : ''}:</strong><br/>
            <a href="${url}" style="color: #0055a5; word-break: break-all;">${url}</a><br/>
            <img src="${url}" alt="Serial Photo" style="margin-top:8px; max-width:400px; border-radius:4px; border:1px solid #ddd;" />
          </td>
        </tr>`).join('');
      photoSection = `
        <div style="margin-top: 25px;">
          <h3 style="font-size: 16px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 8px; margin-bottom: 15px;">📷 Serial Number Photos</h3>
          <table style="width:100%">${photoRows}</table>
        </div>`;
    }

    const html = `
<div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f7f6; padding: 20px; color: #333333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #dddddd;">
    
    <!-- Header -->
    <div style="background-color: #003366; color: #ffffff; padding: 20px; text-align: center;">
      <h2 style="margin: 0; font-size: 24px; letter-spacing: 1px;">CS C4I Help Desk</h2>
      <p style="margin: 5px 0 0; font-size: 14px; color: #cce0ff;">New Multi-Device Ticket Alert</p>
    </div>
    
    <!-- Body -->
    <div style="padding: 30px;">
      
      <!-- Ticket Details Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; background-color: #fcfcfc; border-radius: 6px;">
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-weight: bold; width: 30%; color: #555555;">Ticket ID:</td>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-size: 16px; color: #000000;">#${ticketId}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-weight: bold; color: #555555;">User:</td>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-size: 16px; color: #000000;">${userName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-weight: bold; color: #555555;">Phone:</td>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-size: 16px;">
            <a href="tel:${phone}" style="color: #0055a5; text-decoration: none;">${phone}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-weight: bold; color: #555555;">Product:</td>
          <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-size: 16px; color: #000000;">${selectedProduct}</td>
        </tr>
        <tr>
          <td style="padding: 12px; font-weight: bold; color: #555555;">Assigned PM:</td>
          <td style="padding: 12px; font-size: 16px; color: #cc0000; font-weight: bold;">${pmName}</td>
        </tr>
      </table>

      <!-- Device Issue Log -->
      <div>
        <h3 style="font-size: 16px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 8px; margin-bottom: 15px;">Reported Devices &amp; Issues</h3>
        <div style="background-color: #2b2b2b; color: #a9b7c6; padding: 15px; border-radius: 6px;">
          <pre style="font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap; word-wrap: break-word;">${description}</pre>
        </div>
      </div>

      ${photoSection}
      
    </div>
  </div>
</div>`;

    await resend.emails.send({
      from: 'CS C4I Help Desk <onboarding@resend.dev>',
      to: TICKET_RECIPIENTS,
      subject: `New Help Desk Ticket Alert: #${ticketId}`,
      html
    });

    console.log(`Email sent for ticket #${ticketId}`);
  } catch (error) {
    console.error('Email send error:', error.message);
  }
}
