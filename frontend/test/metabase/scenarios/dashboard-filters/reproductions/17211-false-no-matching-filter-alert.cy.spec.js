import { restore, filterWidget, visitDashboard } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

describe("issue 17211", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.addFilterToDashboard({ filter, dashboard_id });

        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 8,
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
    cy.findByText("Abbeville").click();

    cy.contains("No matching City found").should("not.exist");
  });
});
