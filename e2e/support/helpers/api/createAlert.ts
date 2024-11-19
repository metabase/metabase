import type { Alert, CreateAlertRequest } from "metabase-types/api";

export const createAlert = ({
  card,
  channels = [],
  alert_condition = "rows",
  alert_first_only = false,
  alert_above_goal = false,
}: Partial<CreateAlertRequest> &
  Pick<CreateAlertRequest, "card">): Cypress.Chainable<
  Cypress.Response<Alert>
> => {
  cy.log("Create an alert");

  return cy.request<Alert>("POST", "/api/alert", {
    card,
    channels,
    alert_condition,
    alert_first_only,
    alert_above_goal,
  });
};
