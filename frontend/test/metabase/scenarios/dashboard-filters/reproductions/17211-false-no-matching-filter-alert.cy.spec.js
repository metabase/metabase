import { restore, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATASET;

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
              sizeX: 8,
              sizeY: 6,
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

        cy.visit(`/dashboard/${dashboard_id}`);
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
