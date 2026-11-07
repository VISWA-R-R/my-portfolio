/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { validateContactInput, TARGET_PORTFOLIO_EMAIL } from "../utils/contactValidation.js";

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [statusMessage, setStatusMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [serverConfig, setServerConfig] = useState({ available: null, configured: null, provider: "", problem: "" });
  const [copied, setCopied] = useState(false);
  const submissionInProgress = useRef(false);

  // Check server contact configuration status on load
  useEffect(() => {
    let active = true;
    fetch("/api/contact/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setServerConfig({
            available: true,
            configured: Boolean(data.configured),
            provider: data.provider || "",
            problem: "",
          });
        } else if (active) {
          setServerConfig({ available: false, configured: false, provider: "", problem: "not-found" });
        }
      })
      .catch(() => {
        if (active) setServerConfig({ available: false, configured: false, provider: "", problem: "unreachable" });
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submissionInProgress.current || status === "submitting") return;
    if (serverConfig.available !== true || serverConfig.configured !== true) return;

    // Client-side validation
    const validation = validateContactInput(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    submissionInProgress.current = true;
    setStatus("submitting");
    setStatusMessage("");
    setErrorCode("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.cleanData),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Could not send your message to ${TARGET_PORTFOLIO_EMAIL}. Please try again.`);
      }

      setStatus("success");
      setStatusMessage(result.message || `Your message has been sent to ${TARGET_PORTFOLIO_EMAIL}.`);
      setFormData({ name: "", email: "", message: "" });
    } catch (err) {
      // Network or delivery error: strictly preserve entered message
      setStatus("error");
      setErrorCode(err.message?.includes("not configured") ? "EMAIL_SERVICE_NOT_CONFIGURED" : "SEND_FAILED");
      setStatusMessage(
        err.message ||
          `Failed to dispatch message directly to ${TARGET_PORTFOLIO_EMAIL}. Your text has been preserved above—please try again.`
      );
    } finally {
      submissionInProgress.current = false;
    }
  };

  const handleCopy = () => {
    const text = `From: ${formData.name} <${formData.email}>\n\nMessage:\n${formData.message}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleResetForAnother = () => {
    setStatus("idle");
    setStatusMessage("");
    setErrorCode("");
    setErrors({});
  };

  return (
    <div className="contact-form-container">
      {status === "success" ? (
        <div className="contact-success-card" role="status" aria-live="polite">
          <div className="success-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>Message Accepted</h3>
          <p className="success-detail">{statusMessage}</p>
          <div className="success-destination">
            <span className="dest-label">Recipient:</span>
            <strong className="dest-email">{TARGET_PORTFOLIO_EMAIL}</strong>
          </div>
          <button type="button" className="btn-send-another" onClick={handleResetForAnother}>
            Send Another Message
          </button>
        </div>
      ) : (
        <form className="contact-form direct-send-form" onSubmit={handleSubmit} noValidate>
          {serverConfig.available === false && (
            <div className="form-error-banner wide" role="alert">
              <strong>{serverConfig.problem === "not-found" ? "Contact form endpoint is not deployed." : "Contact form endpoint is unavailable."}</strong>
              <p className="error-text">{serverConfig.problem === "not-found" ? <>Deploy the project with its <code>api/contact</code> Vercel functions. The current site cannot send email until that endpoint exists.</> : "The site could not reach its contact status endpoint. Check the connection and Vercel deployment before sending."}</p>
            </div>
          )}
          {serverConfig.available && serverConfig.configured === false && (
            <div className="form-error-banner wide" role="alert">
              <strong>Email delivery is not configured.</strong>
              <p className="error-text">On Vercel, add Resend's <code>RESEND_API_KEY</code> and verified <code>EMAIL_FROM</code>, or SMTP's <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_SECURE</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> in Project Settings → Environment Variables, then redeploy. For Gmail, an App Password is required; your current Google account says that option is unavailable.</p>
            </div>
          )}
          <div className="form-heading-row">
            <h3>Direct Message</h3>
            <span className="destination-badge" title={`Sends directly to ${TARGET_PORTFOLIO_EMAIL}`}>
              To: {TARGET_PORTFOLIO_EMAIL}
            </span>
          </div>

          <label className={errors.name ? "has-error" : ""}>
            <span>
              Your Name <span className="req">*</span>
            </span>
            <input
              name="name"
              type="text"
              required
              autoComplete="name"
              maxLength={80}
              placeholder="e.g. Alex Chen"
              value={formData.name}
              onChange={handleChange}
              disabled={status === "submitting"}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <span id="name-error" className="field-error" role="alert">
                {errors.name}
              </span>
            )}
          </label>

          <label className={errors.email ? "has-error" : ""}>
            <span>
              Your Email <span className="req">*</span>
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={120}
              placeholder="e.g. alex@example.com"
              value={formData.email}
              onChange={handleChange}
              disabled={status === "submitting"}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <span id="email-error" className="field-error" role="alert">
                {errors.email}
              </span>
            )}
          </label>

          <label className={`wide ${errors.message ? "has-error" : ""}`}>
            <span>
              Message <span className="req">*</span>
            </span>
            <textarea
              name="message"
              rows={4}
              required
              maxLength={3000}
              placeholder="Write your message here… (minimum 10 characters)"
              value={formData.message}
              onChange={handleChange}
              disabled={status === "submitting"}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={errors.message ? "message-error" : undefined}
            />
            {errors.message && (
              <span id="message-error" className="field-error" role="alert">
                {errors.message}
              </span>
            )}
          </label>

          {status === "error" && (
            <div className="form-error-banner" role="alert">
              <div className="error-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <strong>Unable to send message</strong>
              </div>
              <p className="error-text">{statusMessage}</p>

              {errorCode === "EMAIL_SERVICE_NOT_CONFIGURED" && (
                <div className="config-help-box">
                  <p>
                    <strong>Set up email delivery for this portfolio:</strong>
                  </p>
                  <p>
                    Add <code>RESEND_API_KEY</code>, <code>SENDGRID_API_KEY</code>, or <code>SMTP_HOST</code>, <code>SMTP_USER</code>, and <code>SMTP_PASS</code> to the server environment. Keep these credentials private. The server will then deliver messages to <code>{TARGET_PORTFOLIO_EMAIL}</code>.
                  </p>
                </div>
              )}

              <p className="keep-note">
                ✓ <strong>Your message has been preserved</strong> in the form above so you do not lose it.
              </p>
              {formData.message && (
                <button type="button" className="btn-copy-draft" onClick={handleCopy}>
                  {copied ? "✓ Copied to clipboard" : "Copy message to clipboard"}
                </button>
              )}
            </div>
          )}

          <div className="form-actions wide">
            <button
              type="submit"
              className="btn-submit-contact"
              disabled={status === "submitting"}
              aria-busy={status === "submitting"}
            >
              {status === "submitting" ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  <span>Sending to {TARGET_PORTFOLIO_EMAIL}…</span>
                </>
              ) : serverConfig.available === false ? (
                <span>Contact Form Offline</span>
              ) : serverConfig.available !== true ? (
                <span>Checking Email Setup…</span>
              ) : serverConfig.configured === false ? (
                <span>Email Setup Required</span>
              ) : status === "error" ? (
                <>
                  <span>Try Sending Again</span>
                  <span className="arrow" aria-hidden="true"> ➔</span>
                </>
              ) : (
                <>
                  <span>Send Message Directly</span>
                  <span className="arrow" aria-hidden="true"> ➔</span>
                </>
              )}
            </button>
            <span className="target-reminder">
              Target address: <strong>{TARGET_PORTFOLIO_EMAIL}</strong>
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
