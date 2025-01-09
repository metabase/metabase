import type { NotificationChannel } from "../../../frontend/src/metabase-types/api/notifications";

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

export const notificationsMenuButton = () =>
  cy.findByTestId("notifications-menu-button");
export const notificationsMenu = () => cy.findByTestId("notifications-menu");

export const dashboardSubscriptionsButton = () =>
  cy.findByTestId("dashboard-subscription-menu-item");
export const openDashboardSubscriptions = () =>
  dashboardSubscriptionsButton().click();

export const openQuestionAlerts = () => {
  cy.findByTestId("notifications-menu-button").click();
};

export const openNotificationsMenu = (menuItemText?: string) => {
  notificationsMenuButton().click();
  if (menuItemText) {
    notificationsMenu().findByText(menuItemText).click();
  }
};

export const toggleAlertChannel = (channel: string) => {
  cy.findByText(channel).parent().find("input").click({ force: true });
};
