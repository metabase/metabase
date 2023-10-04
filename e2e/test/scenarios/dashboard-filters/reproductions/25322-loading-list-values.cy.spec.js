import {
  addOrUpdateDashboardCard,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const parameterDetails = {
  name: "Location",
  slug: "location",
  id: "f8ec7c71",
  type: "string/=",
  sectionId: "location",
};

const questionDetails = {
  name: "Orders",
  query: { "source-table": ORDERS_ID },
};

const dashboardDetails = {
  name: "Dashboard",
  parameters: [parameterDetails],
};

describe("issue 25322", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show a loader when loading field values (metabase#25322)", () => {
    createDashboard().then(({ dashboard_id }) => {
      visitDashboard(dashboard_id);
      throttleFieldValuesRequest(dashboard_id);
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    popover().findByTestId("loading-spinner").should("exist");
  });
});

const createDashboard = () => {
  return cy
    .createQuestion(questionDetails)
    .then(({ body: { id: card_id } }) => {
      cy.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboard_id } }) => {
          addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              parameter_mappings: [
                {
                  card_id,
                  parameter_id: parameterDetails.id,
                  target: ["dimension", ["field", ORDERS.STATE, null]],
                },
              ],
            },
          }).then(() => ({ dashboard_id }));
        },
      );
    });
};

const throttleFieldValuesRequest = dashboard_id => {
  const matcher = {
    method: "GET",
    url: `/api/dashboard/${dashboard_id}/params/${parameterDetails.id}/values`,
    middleware: true,
  };

  cy.intercept(matcher, req => req.on("response", res => res.setThrottle(10)));
};
