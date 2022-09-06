import {
  restore,
  popover,
  showDashboardCardActions,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
        cy.findByText("Dropdown").click();
      });

      // connect that to people.state
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("State").click();
      });

      // open the linked filters tab, and click the click to add a City filter
      cy.findByText("Linked filters").click();
      cy.findByText("add another dashboard filter").click();
      popover().within(() => {
        cy.findByText("Location").click();
        cy.findByText("Dropdown").click();
      });

      // connect that to person.city
      cy.findByText("Column to filter on")
        .parent()
        .within(() => {
          cy.findByText("Select…").click();
        });
      popover().within(() => {
        cy.findByText("City").click();
      });

      // Link city to state
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

      cy.findByText("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");

      // now test that it worked!
      // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
      cy.findByText("Location").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("Add filter").click();
      });
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.findByPlaceholderText(
          has_field_values === "search" ? "Search by City" : "Search the list",
        ).type("An");
        cy.findByText("Anchorage");
        cy.findByText("Anacoco").should("not.exist");

        cy.get("input").first().clear();
      });

      cy.findByText("AK").click();
      popover().within(() => {
        cy.findByText("AK").click();
        cy.findByText("GA").click();

        cy.findByText("Update filter").click();
      });

      // do it again to make sure it isn't cached incorrectly
      cy.findByText("Location 1").click();
      popover().within(() => {
        cy.get("input").first().type("An");
        cy.findByText("Canton");
        cy.findByText("Anchorage").should("not.exist");
      });

      cy.findByText("GA").click();
      popover().within(() => {
        cy.findByText("GA").click();
        cy.findByText("Update filter").click();
      });

      // do it again without a state filter to make sure it isn't cached incorrectly
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
        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          // Connect filter to that question
          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                size_x: 8,
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
