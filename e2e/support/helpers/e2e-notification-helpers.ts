import type { NotificationChannel } from "metabase-types/api/notification-channels";

export const getAlertChannel = (name: string) =>
  cy.findByRole("listitem", {
    name,
  });

export const WEBHOOK_TEST_SESSION_ID = "00000000-0000-0000-0000-000000000000";
export const WEBHOOK_TEST_HOST = "http://127.0.0.1:9080";

export const WEBHOOK_TEST_URL = `${WEBHOOK_TEST_HOST}/${WEBHOOK_TEST_SESSION_ID}`;
export const WEBHOOK_TEST_DASHBOARD = `${WEBHOOK_TEST_HOST}/#/${WEBHOOK_TEST_SESSION_ID}`;

export const setupNotificationChannel = (
  opts: Partial<NotificationChannel>,
) => {
  cy.request("POST", "/api/channel", {
    type: "channel/http",
    details: {
      url: `${WEBHOOK_TEST_HOST}/${WEBHOOK_TEST_SESSION_ID}`,
      "fe-form-type": "none",
      "auth-method": "none",
      "auth-info": {},
    },
    ...opts,
  });
};

export const resetWebhookTester = () => {
  cy.log("Reset webhook tester");
  cy.request({
    method: "DELETE",
    url: `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
    failOnStatusCode: false, // returns 404 if no requests
  });
};
