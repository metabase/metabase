import type {
  CreateAlertNotificationRequest,
  Notification,
} from "metabase-types/api";

export const createQuestionAlert = ({
  card,
  channels = [],
  alert_condition = "rows",
  alert_first_only = false,
  alert_above_goal = false,
}: Partial<CreateAlertNotificationRequest> &
  Pick<CreateAlertNotificationRequest, "card">): Cypress.Chainable<
  Cypress.Response<Notification>
> => {
  cy.log("Create an alert");

  return cy.request<Notification>("POST", "/api/notification", {
    card,
    channels,
    alert_condition,
    alert_first_only,
    alert_above_goal,
  });
};
