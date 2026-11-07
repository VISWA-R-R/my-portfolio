# Viswa portfolio

## Contact email on Vercel

The contact form uses same-origin Vercel Functions in `api/contact.ts` and `api/contact/status.ts`. It delivers mail to `viswaoff03@gmail.com` through Resend; the API key stays on the server.

1. Recommended: verify a sender domain/address in Resend.
2. In Vercel, open this portfolio project's **Settings → Environment Variables** and add `RESEND_API_KEY` and `EMAIL_FROM` (for example, `Viswa Portfolio <contact@your-verified-domain.com>`).
3. No-domain alternative: use Gmail SMTP by adding `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` (your sending Gmail), `SMTP_PASS` (a Google App Password), and optionally `SMTP_FROM` (same Gmail address). Gmail App Passwords require 2-Step Verification and are unavailable for some accounts. Never use your normal Gmail password. If Google says App Passwords are unavailable, this option cannot be used for that account; use another account that offers them or use verified-domain Resend.
4. Add variables to the Vercel **Production** environment (and Preview/Development if needed), save, and redeploy. Check `/api/contact/status`; it should return `configured: true` and provider `resend` or `smtp`.

All credentials must stay in Vercel's server-side environment variables. Never add them to frontend code, commit a real `.env` file, or share them in chat. SMTP sending is awaited by the Vercel function; only a provider acceptance response is shown as success.

The name, email, and message fields stay editable so visitors can draft or preserve a message while setup is incomplete; only the send button is disabled until the endpoint and Resend settings are ready. The sender must be verified with Resend. Never put the API key in frontend code or commit a real `.env` file.

## Run locally

Install dependencies with `npm install`, create `.env` from `.env.example`, set a supported email provider, then run `npm run dev`. Run `npm run build` to create the production frontend. `npm start` runs the Express server in production mode.
