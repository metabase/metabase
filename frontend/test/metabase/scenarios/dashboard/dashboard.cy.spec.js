// Mostly ported from `dashboard.e2e.spec.js`
// *** Haven't ported: should add the parameter values to state tree for public dashboards
import {
  popover,
  restore,
  signInAsAdmin,
  selectDashboardFilter,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should create new dashboard", () => {
    // Create dashboard
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();
    cy.findByLabelText("Name").type("Test Dash");
    cy.findByLabelText("Description").type("Desc");
    cy.findByText("Create").click();
    cy.findByText("This dashboard is looking empty.");

    // See it as a listed dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("This dashboard is looking empty.").should("not.exist");
    cy.findByText("Test Dash");
  });

  it("should update title and description", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-ellipsis").click();
    cy.findByText("Change title and description").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Test Title");
    cy.findByLabelText("Description")
      .click()
      .clear()
      .type("Test description");

    cy.findByText("Update").click();
    cy.findByText("Test Title");
    cy.get(".Icon-info").click();
    cy.findByText("Test description");
  });

  it("should add a filter", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-filter").click();
    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    cy.findByText("Location").click();
    cy.findByText("State").click();
    cy.findByText("Select…").click();

    popover().within(() => {
      cy.findByText("State").click();
    });
    cy.get(".Icon-close");
    cy.get(".Button--primary")
      .contains("Done")
      .click();

    saveDashboard();

    cy.log("**Assert that the selected filter is present in the dashboard**");
    cy.get(".Icon-location");
    cy.findByText("State");
  });

  it("should add a question", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByText("Orders, Count");
  });

  it("should duplicate a dashboard", () => {
    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");
    cy.get(".Icon-ellipsis").click();
    cy.findByText("Duplicate").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Doppleganger");
    cy.get(".Button--primary")
      .contains("Duplicate")
      .click();

    cy.findByText("Orders in a dashboard").should("not.exist");
    cy.findByText("Doppleganger");
  });

  it("should link filters to custom question with filtered aggregate data (metabase#11007)", () => {
    // programatically create and save a question as per repro instructions in #11007
    cy.request("POST", "/api/card", {
      name: "11007",
      dataset_query: {
        database: 1,
        filter: [">", ["field-literal", "sum", "type/Float"], 100],
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "day"],
            [
              "fk->",
              ["field-id", ORDERS.PRODUCT_ID],
              ["field-id", PRODUCTS.ID],
            ],
            [
              "fk->",
              ["field-id", ORDERS.PRODUCT_ID],
              ["field-id", PRODUCTS.CATEGORY],
            ],
          ],
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    });

    // create a dashboard
    cy.request("POST", "/api/dashboard", {
      name: "dash:11007",
    });

    cy.visit("/collection/root");
    // enter newly created dashboard
    cy.findByText("dash:11007").click();
    cy.findByText("This dashboard is looking empty.");
    // add previously created question to it
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-add")
      .last()
      .click();
    cy.findByText("11007").click();

    // add first filter
    cy.get(".Icon-filter").click();
    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Created At");

    // add second filter
    cy.get(".Icon-filter").click();
    popover().within(() => {
      cy.findByText("ID").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Product ID");

    // add third filter
    cy.get(".Icon-filter").click();
    popover().within(() => {
      cy.findByText("Other Categories").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Category");

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });

  it.skip("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    // 1. create a question based on repro steps in #13597
    cy.request("POST", "/api/card", {
      name: "13597",
      dataset_query: {
        database: 1,
        query: {
          "source-table": PEOPLE_ID,
          limit: 2,
        },
        type: "query",
      },
      display: "map",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      // 2. create a dashboard
      cy.request("POST", "/api/dashboard", {
        name: "13597D",
      }).then(({ body: { id: dashboardId } }) => {
        // add filter (ID) to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "92eb69ea",
              name: "ID",
              slug: "id",
              type: "id",
            },
          ],
        });

        // add previously created question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // connect filter to that question
          cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
            cards: [
              {
                id: dashCardId,
                card_id: questionId,
                row: 0,
                col: 0,
                sizeX: 10,
                sizeY: 8,
                parameter_mappings: [
                  {
                    parameter_id: "92eb69ea",
                    card_id: questionId,
                    target: ["dimension", ["field-id", PEOPLE.ID]],
                  },
                ],
                visualization_settings: {
                  // set click behavior to update filter (ID)
                  click_behavior: {
                    type: "crossfilter",
                    parameterMapping: {
                      id: "92eb69ea",
                      source: { id: "ID", name: "ID", type: "column" },
                      target: {
                        id: "92eb69ea",
                        type: "parameter",
                      },
                    },
                  },
                },
              },
            ],
          });
        });

        cy.visit(`/dashboard/${dashboardId}`);
        cy.get(".leaflet-marker-icon") // pin icon
          .eq(0)
          .click({ force: true });
        cy.url().should("include", `/dashboard/${dashboardId}?id=1`);
        cy.contains("Hudson Borer - 1");
      });
    });
  });

  describe("revisions screen", () => {
    it("should open and close", () => {
      cy.visit("/dashboard/1");
      cy.get(".Icon-ellipsis").click();
      cy.findByText("Revision history").click();

      cy.get(".Modal").within(() => {
        cy.get(".LoadingSpinner").should("not.exist");
      });

      cy.findAllByText("Bobby Tables");
      cy.contains(/revert/i);

      cy.get(".Modal .Icon-close").click();
      cy.findAllByText("Bobby Tables").should("not.exist");
    });

    it("should open with url", () => {
      cy.visit("/dashboard/1/history");
      cy.get(".Modal").within(() => {
        cy.get(".LoadingSpinner").should("not.exist");
        cy.findByText("Revision history");
      });

      cy.findAllByText("Bobby Tables");
      cy.contains(/revert/i);
    });
  });
});
