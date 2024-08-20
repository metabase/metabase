import type {
  CreateSubscriptionRequest,
  DashboardSubscription,
} from "metabase-types/api";

export const createPulse = ({
  name = "Pulse",
  cards = [],
  channels = [],
  dashboard_id,
}: Partial<CreateSubscriptionRequest>): Cypress.Chainable<
  Cypress.Response<DashboardSubscription>
> => {
  cy.log("Create a pulse");

  return cy.request<DashboardSubscription>("POST", "/api/pulse", {
    name,
    cards,
    channels,
    dashboard_id,
  });
};
