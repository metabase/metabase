/**
 * The timeout to wait for a session token from the embed.js script.
 * This is a fallback in case the embed.js script doesn't send a message.
 *
 * This is set to 5 minutes to leave room for SSO auth to complete.
 */
export const WAIT_FOR_SESSION_TOKEN_TIMEOUT = 5 * 60 * 1000;
