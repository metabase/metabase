import { sidebar } from "e2e/support/helpers";

import { WEBMAIL_CONFIG } from "../cypress_data";

const INBOX_TIMEOUT = 5000;
const INBOX_INTERVAL = 100;

const { WEB_PORT, SMTP_PORT } = WEBMAIL_CONFIG;

/**
 * Make sure you have webmail Docker image running locally:
 * `docker run -d -p 1080:1080 -p 1025:1025 maildev/maildev:2.0.5`
 * or
 * `npx maildev -s 1025 -w 1080`
 */
export const setupSMTP = () => {
  cy.log("Set up Webmail SMTP server");

  cy.request("PUT", "/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": SMTP_PORT,
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
    "email-from-name": "Metabase",
    "email-reply-to": ["reply-to@metabase.test"],
  });

  // We must always clear Webmail's inbox before each test
  clearInbox();
};

export const getInbox = () => {
  return getInboxWithRetry();
};

const getInboxWithRetry = (timeout = INBOX_TIMEOUT) => {
  return cy
    .request("GET", `http://localhost:${WEB_PORT}/email`)
    .then(response => {
      if (response.body.length) {
        return cy.wrap(response);
      } else if (timeout > 0) {
        cy.wait(INBOX_INTERVAL);
        return getInboxWithRetry(timeout - INBOX_INTERVAL);
      } else {
        throw new Error("Inbox retry timeout");
      }
    });
};

export const clearInbox = () => {
  return cy.request("DELETE", `http://localhost:${WEB_PORT}/email/all`);
};

export const viewEmailPage = emailSubject => {
  const webmailInterface = `http://localhost:${WEB_PORT}`;

  cy.window().then(win => (win.location.href = webmailInterface));
  cy.findByText(emailSubject).click();
};

export const openEmailPage = emailSubject => {
  const webmailInterface = `http://localhost:${WEB_PORT}`;

  cy.window().then(win => (win.location.href = webmailInterface));
  cy.findByText(emailSubject).click();

  return cy.hash().then(path => {
    const htmlPath = `${webmailInterface}${path.slice(1)}/html`;
    cy.window().then(win => (win.location.href = htmlPath));
    cy.findByText(emailSubject);
  });
};

export const clickSend = () => {
  cy.intercept("POST", "/api/pulse/test").as("emailSent");

  cy.findByText("Send email now").click();
  cy.wait("@emailSent");
};

export const openAndAddEmailToSubscriptions = recipient => {
  cy.findByLabelText("subscriptions").click();

  cy.findByText("Email it").click();
  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(`${recipient}{enter}`)
    .blur();
};

export const setupSubscriptionWithRecipient = recipient => {
  openAndAddEmailToSubscriptions(recipient);
  sidebar().findByText("Done").click();
};

export const openPulseSubscription = () => {
  sidebar().findByLabelText("Pulse Card").click();
};

export const emailSubscriptionRecipients = () => {
  openPulseSubscription();
  clickSend();
};

export const sendSubscriptionsEmail = recipient => {
  openAndAddEmailToSubscriptions(recipient);
  clickSend();
};

export function sendEmailAndAssert(callback) {
  clickSend();

  cy.request("GET", `http://localhost:${WEB_PORT}/email`).then(({ body }) => {
    callback(body[0]);
  });
}

export function sendEmailAndVisitIt() {
  clickSend();
  const emailUrl = `http://localhost:${WEB_PORT}/email`;
  return cy.request("GET", emailUrl).then(({ body }) => {
    const latest = body.slice(-1)[0];
    cy.visit(`${emailUrl}/${latest.id}/html`);
  });
}
