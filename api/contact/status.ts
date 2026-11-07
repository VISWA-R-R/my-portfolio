const DESTINATION = 'viswaoff03@gmail.com';

export default function handler(_request: any, response: any) {
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const configured = resendConfigured || smtpConfigured;
  response.status(200).json({
    configured,
    provider: resendConfigured ? 'resend' : smtpConfigured ? 'smtp' : 'none',
    destination: DESTINATION,
  });
}
