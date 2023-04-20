import {
  restore,
  popover,
  visitDashboard,
  rightSidebar,
  filterWidget,
  editDashboard,
  saveDashboard,
} from "e2e/support/helpers";
// NOTE: some overlap with parameters-embedded.cy.spec.js
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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

      const questionDetails = {
        name: "Products table",
        query: {
          "source-table": PRODUCTS_ID,
        },
      };

      const dashboardDetails = {
        parameters: [filter],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
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
        },
      );
    });

    it("should work", () => {
      cy.findAllByText("Doohickey");

      cy.button("Category").click();
      popover().within(() => {
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      // verify that the filter is applied
      cy.findByText("Doohickey").should("not.exist");

      // test prevent auto-apply filters in slow dashboards metabase#29267
      toggleDashboardSidebar();

      filterWidget().findByText("Gadget").should("be.visible");
      rightSidebar().findByLabelText("Auto-apply filters").click();
      cy.button("Apply").should("not.exist");

      cy.button("Category").click();
      popover().within(() => {
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      cy.findByText("Rows 1-6 of 200").should("be.visible");
      cy.button("Apply").click();
      cy.findByText("Rows 1-6 of 53").should("be.visible");

      // test that the apply button won't showup even when adding a new parameter or removing existing ones
      toggleDashboardSidebar();
      editDashboard();
      cy.icon("filter").click();
      popover().within(() => {
        cy.findByText("Text or Category").click();
        cy.findByText("Is").click();
      });

      saveDashboard();
      cy.button("Apply").should("not.exist");

      editDashboard();
      cy.findByText("Text").within(() => {
        cy.icon("gear").click();
      });
      cy.button("Remove").click();
      saveDashboard();
      cy.button("Apply").should("not.exist");
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

      const questionDetails = {
        name: "People table",
        query: {
          "source-table": PEOPLE_ID,
        },
      };

      const dashboardDetails = { parameters: [filter] };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
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
        },
      );
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

      const questionDetails = {
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
      };

      const dashboardDetails = { parameters: [filter] };

      cy.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
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

function toggleDashboardSidebar() {
  cy.get("main header").within(() => {
    cy.icon("info").click();
  });
}
