import { restore, popover, visitDashboard } from "__support__/e2e/helpers";
// NOTE: some overlap with parameters-embedded.cy.spec.js
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

// the dashboard parameters used in these tests ('category' and 'location/...') are no longer accessible
// via the UI but should still work as expected

describe("scenarios > dashboard > OLD parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("question connected to a 'category' parameter", () => {
    beforeEach(() => {
      const filter = {
        id: "c2967a17",
        name: "Category",
        slug: "category",
        type: "category",
      };

      cy.createQuestion({
        name: "Products table",
        query: {
          "source-table": PRODUCTS_ID,
        },
      }).then(({ body: { id: card_id } }) => {
        cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
          }).then(({ body: { id } }) => {
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
                  parameter_mappings: [
                    {
                      card_id,
                      parameter_id: filter.id,
                      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                    },
                  ],
                },
              ],
            });

            visitDashboard(dashboard_id);
          });
        });
      });
    });

    it("should work", () => {
      cy.findAllByText("Doohickey");

      cy.contains("Category").click();
      popover().within(() => {
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      // verify that the filter is applied
      cy.findByText("Doohickey").should("not.exist");
    });
  });

  describe("question connected to a 'location/state' parameter", () => {
    beforeEach(() => {
      const filter = {
        id: "c2967a17",
        name: "City",
        slug: "city",
        type: "location/city",
      };

      cy.createQuestion({
        name: "People table",
        query: {
          "source-table": PEOPLE_ID,
        },
      }).then(({ body: { id: card_id } }) => {
        cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
          }).then(({ body: { id } }) => {
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
                  parameter_mappings: [
                    {
                      card_id,
                      parameter_id: filter.id,
                      target: ["dimension", ["field", PEOPLE.CITY, null]],
                    },
                  ],
                },
              ],
            });

            visitDashboard(dashboard_id);
          });
        });
      });
    });

    it("should work", () => {
      cy.contains("City").click();
      popover().within(() => {
        cy.get("input").type("Flagstaff{enter}");
        cy.findByText("Add filter").click();
      });

      cy.get(".DashCard tbody tr").should("have.length", 1);
    });
  });

  describe("native question field filter connected to 'category' parameter", () => {
    beforeEach(() => {
      const filter = {
        id: "c2967a17",
        name: "Category",
        slug: "category",
        type: "category",
      };

      cy.createNativeQuestion({
        name: "Products SQL",
        native: {
          query: "select * from products where {{category}}",
          "template-tags": {
            category: {
              "display-name": "Field Filter",
              id: "abc123",
              name: "category",
              type: "dimension",
              "widget-type": "category",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              default: ["Doohickey"],
            },
          },
        },
        display: "table",
      }).then(({ body: { id: card_id } }) => {
        cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
          cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
            cardId: card_id,
          }).then(({ body: { id } }) => {
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
                  parameter_mappings: [
                    {
                      card_id,
                      parameter_id: "c2967a17",
                      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                    },
                  ],
                },
              ],
            });

            visitDashboard(dashboard_id);
          });
        });
      });
    });

    it("should work", () => {
      cy.findAllByText("Doohickey");

      cy.contains("Category").click();
      popover().within(() => {
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      // verify that the filter is applied
      cy.findByText("Doohickey").should("not.exist");
    });
  });
});
