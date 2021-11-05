/**
 * Make sure you have webmail Docker image running locally:
 * `docker run -p 80:80 -p 25:25 maildev/maildev`
 *
 * or
 *
 * install: `yarn global add maildev`
 * run:     `maildev -s 25 -w 80`
 */
export function setupSMTP() {
  cy.log("Set up Webmail SMTP server");

  cy.request("PUT", "/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": "25",
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
    "email-pulse-url": "https://my.app.url",
  });

  // We must always clear Webmail's inbox before each test
  clearInbox();
}

export function clearInbox() {
  cy.request("DELETE", "http://localhost:80/email/all");
}
