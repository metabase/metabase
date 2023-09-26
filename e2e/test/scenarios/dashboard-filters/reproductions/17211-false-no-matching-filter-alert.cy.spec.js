import { restore, filterWidget, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  query: {
    "source-table": ORDERS_ID,
  },
};

const filter = {
  name: "Location",
  slug: "location",
  id: "96917420",
  type: "string/=",
  sectionId: "location",
};

const dashboardDetails = {
  parameters: [filter],
};

describe("issue 17211", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PEOPLE.CITY,
                      {
                        "source-field": ORDERS.USER_ID,
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("should not falsely alert that no matching dashboard filter has been found (metabase#17211)", () => {
    filterWidget().click();

    cy.findByPlaceholderText("Search by City").type("abb");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Abbeville").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("No matching City found").should("not.exist");
  });
});
