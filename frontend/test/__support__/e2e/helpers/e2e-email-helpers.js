const INBOX_TIMEOUT = 5000;
const INBOX_INTERVAL = 100;

/**
 * Make sure you have webmail Docker image running locally:
 * `docker run -p 80:80 -p 25:25 maildev/maildev:1.1.0`
 *
 * or
 *
 * install: `yarn global add maildev`
 * run:     `maildev -s 25 -w 80`
 */
export const setupSMTP = () => {
  cy.log("Set up Webmail SMTP server");

  cy.request("PUT", "/api/email", {
    "email-smtp-host": "localhost",
    "email-smtp-port": "25",
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
  return cy.request("GET", `http://localhost:80/email`).then(response => {
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
  return cy.request("DELETE", "http://localhost:80/email/all");
};

export const openEmailPage = emailSubject => {
  cy.window().then(win => (win.location.href = "http://localhost"));
  cy.findByText(emailSubject).click();

  return cy.hash().then(path => {
    const htmlPath = `http://localhost${path.slice(1)}/html`;
    cy.window().then(win => (win.location.href = htmlPath));
    cy.findByText(emailSubject);
  });
};

export const clickSend = () => {
  cy.button("Send email now").click();
  cy.button("Email sent", 30000);
};

export const sendSubscriptionsEmail = recipient => {
  cy.icon("subscription").click();

  cy.findByText("Email it").click();
  cy.findByPlaceholderText("Enter user names or email addresses")
    .click()
    .type(`${recipient}{enter}`)
    .blur();

  clickSend();
};
