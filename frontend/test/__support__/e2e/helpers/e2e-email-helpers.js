/**
 * Make sure you have webmail Docker image running locally:
 * `docker run -p 1025:25 -p 1080:80 maildev/maildev`
 *
 * or
 *
 * install: `yarn global add maildev`
 * run:     `maildev -s 1025 -w 1080`
 */
export function setupSMTP() {
  cy.log("Set up Webmail SMTP server");

  cy.request("PUT", "/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": "1025",
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
  });

  // We must always clear Webmail's inbox before each test
  clearInbox();
}

export function clearInbox() {
  cy.request("DELETE", "http://localhost:1080/email/all");
}
