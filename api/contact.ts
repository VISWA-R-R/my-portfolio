import { validateContactInput, TARGET_PORTFOLIO_EMAIL } from '../utils/contactValidation.js';
import nodemailer from 'nodemailer';

const rateHistory = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

function limited(ip: string) {
  const now = Date.now();
  const recent = (rateHistory.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  rateHistory.set(ip, recent);
  return false;
}

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  const { name, email, message, website, company, _gotcha } = request.body || {};
  if (website || company || _gotcha) {
    return response.status(400).json({ success: false, error: 'Invalid submission detected.' });
  }

  const forwardedFor = request.headers?.['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') || request.socket?.remoteAddress || 'unknown';
  if (limited(ip)) {
    return response.status(429).json({ success: false, error: 'Too many messages. Please wait 15 minutes before trying again.' });
  }

  const validation = validateContactInput({ name, email, message });
  if (!validation.valid || !validation.cleanData) {
    return response.status(400).json({ success: false, error: 'Please check your name, email, and message.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if ((!apiKey || !from) && !smtpConfigured) {
    return response.status(503).json({
      success: false,
      code: 'EMAIL_SERVICE_NOT_CONFIGURED',
      error: 'Email delivery is not configured. Add Resend credentials (RESEND_API_KEY and EMAIL_FROM) or SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and optional SMTP_FROM) to Vercel, then redeploy.',
    });
  }

  const clean = validation.cleanData;
  const escapedName = escapeHtml(clean.name);
  const escapedEmail = escapeHtml(clean.email);
  const escapedMessage = escapeHtml(clean.message);
  const subject = `[Portfolio Contact] New message from ${clean.name}`;
  const text = `New portfolio message for Viswa R R\n\nFrom: ${clean.name} <${clean.email}>\n\n${clean.message}`;
  const html = `<h2>New portfolio contact message</h2><p><strong>From:</strong> ${escapedName} &lt;${escapedEmail}&gt;</p><p style="white-space:pre-wrap">${escapedMessage}</p>`;

  try {
    // Resend is preferred when configured; SMTP permits Gmail without owning a domain.
    if (!apiKey || !from) {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: TARGET_PORTFOLIO_EMAIL,
        replyTo: clean.email,
        subject,
        text,
        html,
      });
      if (!info.messageId) {
        return response.status(502).json({ success: false, error: 'The SMTP service did not confirm acceptance of the message. Please try again.' });
      }
      return response.status(200).json({
        success: true,
        id: info.messageId,
        message: `Your message was accepted by the email service for ${TARGET_PORTFOLIO_EMAIL}.`,
      });
    }

    const providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [TARGET_PORTFOLIO_EMAIL],
        reply_to: clean.email,
        subject,
        text,
        html,
      }),
    });
    const result = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok || typeof result.id !== 'string' || !result.id) {
      console.error('Resend rejected portfolio email:', providerResponse.status, result);
      return response.status(502).json({
        success: false,
        error: 'The email provider rejected the message. Check the verified sender address and Resend settings, then try again.',
      });
    }

    return response.status(200).json({
      success: true,
      id: result.id,
      message: `Your message was accepted by the email service for ${TARGET_PORTFOLIO_EMAIL}.`,
    });
  } catch (error) {
    console.error('Resend request failed:', error);
    return response.status(502).json({ success: false, error: 'Could not reach the email provider. Your message is still in the form; please try again later.' });
  }
}
