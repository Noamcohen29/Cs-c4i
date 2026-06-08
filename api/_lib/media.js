import { put } from '@vercel/blob';

export async function uploadWhatsAppMediaToBlob(mediaId, mimeType, folder = 'invoices') {
  try {
    if (!mediaId) return null;
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('Blob upload error: BLOB_READ_WRITE_TOKEN is not set');
      return null;
    }
    const token = process.env.WHATSAPP_TOKEN;
    const mediaInfoResponse = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const mediaInfo = await mediaInfoResponse.json();
    if (!mediaInfo?.url) return null;

    const mediaResponse = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const arrayBuffer = await mediaResponse.arrayBuffer();
    const contentType = mimeType || mediaResponse.headers.get('content-type') || 'application/octet-stream';
    const extension = contentType.split('/')[1] || 'bin';
    const blobName = `${folder}/${mediaId}.${extension}`;
    const { url } = await put(blobName, new Uint8Array(arrayBuffer), {
      access: 'private',
      contentType
    });
    return url;
  } catch (error) {
    console.error('Blob upload error:', error.message);
    return null;
  }
}
