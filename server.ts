import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { validateContactInput, TARGET_PORTFOLIO_EMAIL } from './utils/contactValidation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory rate limiter to prevent duplicate / spam submissions
const ipRequestHistory = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRequestHistory.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  timestamps.push(now);
  ipRequestHistory.set(ip, timestamps);
  return false;
}

function getActiveEmailProvider(): 'resend' | 'smtp' | 'sendgrid' | 'none' {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  return 'none';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '64kb' }));

  // Explicit download endpoint for project zip archive
  app.get('/viswa-portfolio.zip', (req, res) => {
    const zipPath = path.join(__dirname, 'public', 'viswa-portfolio.zip');
    res.download(zipPath, 'viswa-portfolio.zip', (err) => {
      if (err) {
        console.error('Error sending zip file:', err);
        if (!res.headersSent) {
          res.status(404).send('Archive not found.');
        }
      }
    });
  });

  // Status endpoint so client and user can inspect delivery readiness
  app.get('/api/contact/status', (req, res) => {
    const provider = getActiveEmailProvider();
    res.json({
      configured: provider !== 'none',
      provider,
      destination: TARGET_PORTFOLIO_EMAIL,
    });
  });

  // Direct contact message dispatch
  app.post('/api/contact', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Anti-bot honeypot check
    if (req.body._gotcha || req.body.website || req.body.company) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission detected.',
      });
    }

    if (isRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        error: 'Too many messages sent. Please wait a few minutes before trying again.',
      });
    }

    const { name, email, message } = req.body;
    const validation = validateContactInput({ name, email, message });

    if (!validation.valid || !validation.cleanData) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
      });
    }

    const clean = validation.cleanData;
    const provider = getActiveEmailProvider();

    if (provider === 'none') {
      return res.status(503).json({
        success: false,
        error: 'Email delivery is not configured on this server. Add RESEND_API_KEY, SMTP credentials, or SENDGRID_API_KEY to the deployment environment.',
      });
    }

    const emailSubject = `[Portfolio Contact] New message from ${clean.name}`;
    const emailText = `New portfolio contact message for Viswa R R:\n\nSender Name: ${clean.name}\nSender Email: ${clean.email}\n\nMessage:\n${clean.message}\n\nTimestamp: ${new Date().toISOString()}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #f8fafc;">
        <h2 style="color: #1e293b; margin-top: 0; border-bottom: 2px solid #3b82f6; padding-bottom: 12px;">New Portfolio Contact Message</h2>
        <p style="margin: 8px 0; font-size: 15px;"><strong>From:</strong> ${clean.name} (&lt;<a href="mailto:${clean.email}">${clean.email}</a>&gt;)</p>
        <p style="margin: 8px 0; font-size: 15px;"><strong>Received:</strong> ${new Date().toLocaleString()}</p>
        <div style="margin-top: 20px; padding: 16px; background-color: #ffffff; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Message:</h3>
          <p style="white-space: pre-wrap; font-size: 16px; line-height: 1.6; color: #0f172a; margin: 0;">${clean.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <p style="margin-top: 24px; font-size: 13px; color: #64748b;">You can reply directly to this email to reply to ${clean.name} at ${clean.email}.</p>
      </div>
    `;

    try {
      if (provider === 'resend') {
        const fromAddress = process.env.EMAIL_FROM || 'Viswa Portfolio <onboarding@resend.dev>';
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [TARGET_PORTFOLIO_EMAIL],
            reply_to: clean.email,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
          }),
        });

        const resendData = await resendRes.json();
        if (!resendRes.ok) {
          console.error('Resend delivery error:', resendData);
          return res.status(502).json({
            success: false,
            error: resendData.message || 'Email delivery failed through Resend service.',
          });
        }

        return res.json({
          success: true,
          message: `Your message was accepted by the email service for ${TARGET_PORTFOLIO_EMAIL}.`,
          id: resendData.id,
        });
      }

      if (provider === 'smtp') {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
        const info = await transporter.sendMail({
          from: `"Portfolio Contact" <${fromAddress}>`,
          to: TARGET_PORTFOLIO_EMAIL,
          replyTo: clean.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });

        return res.json({
          success: true,
          message: `Your message was accepted by the email service for ${TARGET_PORTFOLIO_EMAIL}.`,
          id: info.messageId,
        });
      }

      if (provider === 'sendgrid') {
        const fromAddress = process.env.EMAIL_FROM || 'no-reply@viswa-portfolio.dev';
        const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: TARGET_PORTFOLIO_EMAIL }] }],
            from: { email: fromAddress, name: 'Portfolio Contact' },
            reply_to: { email: clean.email, name: clean.name },
            subject: emailSubject,
            content: [
              { type: 'text/plain', value: emailText },
              { type: 'text/html', value: emailHtml },
            ],
          }),
        });

        if (!sgRes.ok) {
          const sgError = await sgRes.text();
          console.error('SendGrid error:', sgError);
          return res.status(502).json({
            success: false,
            error: 'Failed to dispatch email via SendGrid.',
          });
        }

        return res.json({
          success: true,
          message: `Your message was accepted by the email service for ${TARGET_PORTFOLIO_EMAIL}.`,
        });
      }

      return res.status(500).json({ success: false, error: 'Email provider configuration is invalid.' });
    } catch (err: any) {
      console.error('Error dispatching contact email:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error while sending email. Please try again.',
      });
    }
  });

  // Serve Vite app in dev or built app in production
  if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
