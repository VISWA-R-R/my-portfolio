/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const TARGET_PORTFOLIO_EMAIL = "viswaoff03@gmail.com";

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates contact form submission data.
 * @param {{ name?: string, email?: string, message?: string }} data
 * @returns {{ valid: boolean, errors: Record<string, string>, cleanData?: { name: string, email: string, message: string } }}
 */
export function validateContactInput(data = {}) {
  const errors = {};

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";

  if (!name) {
    errors.name = "Please enter your name.";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters.";
  } else if (name.length > 100) {
    errors.name = "Name cannot exceed 100 characters.";
  }

  if (!email) {
    errors.email = "Please enter your email address.";
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Please enter a valid email address (e.g. yourname@domain.com).";
  } else if (email.length > 150) {
    errors.email = "Email cannot exceed 150 characters.";
  }

  if (!message) {
    errors.message = "Please write a message.";
  } else if (message.length < 10) {
    errors.message = "Message must be at least 10 characters long.";
  } else if (message.length > 3000) {
    errors.message = "Message cannot exceed 3000 characters.";
  }

  const valid = Object.keys(errors).length === 0;

  return {
    valid,
    errors,
    ...(valid ? { cleanData: { name, email, message } } : {}),
  };
}
