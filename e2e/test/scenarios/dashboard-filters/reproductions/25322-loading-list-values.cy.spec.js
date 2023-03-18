import { popover, restore, visitDashboard } from "e2e/support/helpers";
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
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
            row: 0,
            col: 0,
            size_x: 4,
            size_y: 4,
          }).then(({ body: { id: dashcard_id } }) => {
            cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
              cards: [
                {
                  id: dashcard_id,
                  card_id,
                  row: 0,
                  col: 0,
                  size_x: 4,
                  size_y: 4,
                  parameter_mappings: [
                    {
                      card_id,
                      parameter_id: parameterDetails.id,
                      target: ["dimension", ["field", ORDERS.STATE, null]],
                    },
                  ],
                },
              ],
            }).then(() => {
              return { dashboard_id };
            });
          });
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
