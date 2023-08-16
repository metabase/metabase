import {
  restore,
  popover,
  showDashboardCardActions,
  visitDashboard,
  addOrUpdateDashboardCard,
  getDashboardCard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > chained filter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  for (const has_field_values of ["search", "list"]) {
    it(`limit ${has_field_values} options based on linked filter`, () => {
      cy.request("PUT", `/api/field/${PEOPLE.CITY}`, { has_field_values }),
        visitDashboard(1);
      // start editing
      cy.icon("pencil").click();

      // add a state filter
      cy.icon("filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Is").click();
      });

      // connect that to people.state
      getDashboardCard().within(() => {
        cy.findByText("Column to filter on");
        cy.findByText("Select…").click();
      });

      popover().within(() => {
        cy.findByText("State").click();
      });

      // open the linked filters tab, and click the click to add a City filter
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Linked filters").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("add another dashboard filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Is").click();
      });

      // connect that to person.city
      getDashboardCard().within(() => {
        cy.findByText("Column to filter on");
        cy.findByText("Select…").click();
      });
      popover().within(() => {
        cy.findByText("City").click();
      });

      // Link city to state
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Limit this filter's choices")
        .parent()
        .within(() => {
          // turn on the toggle
          cy.findByText("Location")
            .parent()
            .within(() => {
              cy.get("input").click();
            });

          // open up the list of linked columns
          cy.findByText("Location").click();
          // It's hard to assert on the "table.column" pairs.
          // We just assert that the headers are there to know that something appeared.
          cy.findByText("Filtering column");
          cy.findByText("Filtered column");
        });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("Add filter").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.findByPlaceholderText(
          has_field_values === "search" ? "Search by City" : "Search the list",
        ).type("An");
        cy.findByText("Anchorage");
        cy.findByText("Anacoco").should("not.exist");

        cy.get("input").first().clear();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("AK").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("GA").click();

        cy.findByText("Update filter").click();
      });

      // do it again to make sure it isn't cached incorrectly
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.get("input").first().type("An");
        cy.findByText("Canton");
        cy.findByText("Anchorage").should("not.exist");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("GA").click();
      popover().within(() => {
        cy.findByText("GA").click();
        cy.findByText("Update filter").click();
      });

      // do it again without a state filter to make sure it isn't cached incorrectly
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.get("input").first().type("An");
        cy.findByText("Adrian");
        cy.findByText("Anchorage");
        cy.findByText("Canton");
      });
    });
  }

  it.skip("should work for all field types (metabase#15170)", () => {
    // Change Field Types for the following fields
    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      special_type: null,
    });

    cy.request("PUT", `/api/field/${PRODUCTS.EAN}`, {
      special_type: "type/PK",
    });

    cy.createQuestion({
      name: "15170",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        // Add filter to the dashboard
        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          parameters: [
            {
              id: "50c9eac6",
              name: "ID",
              slug: "id",
              type: "id",
            },
          ],
        });

        // Add previously created question to the dashboard
        addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to that question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                size_x: 11,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: "50c9eac6",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PRODUCTS.EAN]],
                  },
                ],
              },
            ],
          });
        });

        visitDashboard(DASHBOARD_ID);
        cy.icon("pencil").click();
        showDashboardCardActions();
        cy.icon("click").click();
        cy.findByText(/Ean/i).click();
        cy.findByText("Update a dashboard filter").click();
        cy.findByText("Available filters").parent().findByText(/ID/i).click();
        popover().within(() => {
          cy.findByText(/Ean/i);
        });
      });
    });
  });
});
