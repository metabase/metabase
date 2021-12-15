import { restore } from "__support__/e2e/cypress";
// NOTE: some overlap with parameters-embedded.cy.spec.js

describe.skip("scenarios > dashboard > parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("native question variable connected to 'category' parameter", () => {
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
          query: "select * from products",
          "template-tags": {},
        },
        display: "table",
      }).then(({ body: { id: card_id } }) => {
        cy.createQuestion({
          name: "Products use saved SQL question",
          query: {
            "source-table": `card__${card_id}`,
            aggregation: [],
            breakout: [],
          },
        }).then(({ body: { id: card_id } }) => {
          cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
            // Add previously created question to the dashboard
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
                    sizeX: 8,
                    sizeY: 6,
                    parameter_mappings: [
                      {
                        card_id: 5,
                        parameter_id: "c2967a17",
                        target: [
                          "dimension",
                          ["field", "TITLE", { "base-type": "type/Text" }],
                        ],
                      },
                    ],
                  },
                ],
              });
            });

            cy.visit(`/dashboard/${dashboard_id}`);
          });
        });
      });
    });
  });

  // beforeEach(() => {
  //   mockSessionProperty("field-filter-operators-enabled?", false);
  //   restore();
  //   cy.signInAsAdmin();
  // });

  // it("should hide field operator parameters/show old options", () => {
  //   cy.visit("/dashboard/1");

  //   // Add a filter
  //   cy.icon("pencil").click();
  //   cy.icon("filter").click();

  //   cy.findByText("Number").should("not.exist");
  //   cy.findByText("Text or Category").should("not.exist");

  //   cy.findByText("Location").click();
  //   cy.findByText("Contains").should("not.exist");
  //   cy.findByText("City").should("exist");

  //   cy.icon("filter").click();
  // });

  // it("should filter by city", () => {
  //   cy.visit("/dashboard/1");

  //   cy.icon("pencil").click();
  //   cy.icon("filter").click();

  //   cy.findByText("Location").click();
  //   cy.findByText("City").click();

  //   cy.findByText("Select…").click();
  //   popover().within(() => {
  //     cy.findByText("City").click();
  //   });

  //   cy.findByText("No default").click();
  //   cy.findByPlaceholderText("Search by City")
  //     .click()
  //     .type("B");
  //   cy.findByText("Baker").click();
  //   cy.findByText("Add filter").click();
  //   cy.get(".Button--primary")
  //     .contains("Done")
  //     .click();

  //   cy.findByText("Save").click();
  //   cy.findByText("You're editing this dashboard.").should("not.exist");
  //   cy.findByText("Baker");

  //   cy.findAllByTestId("table-row").should("have.length", 8);
  // });

  // it("should filter by category", () => {
  //   cy.visit("/dashboard/1");

  //   cy.icon("pencil").click();
  //   cy.icon("filter").click();

  //   cy.findByText("Other Categories").click();

  //   cy.findByText("Select…").click();
  //   popover().within(() => {
  //     cy.findByText("Name").click();
  //   });

  //   cy.contains("Done").click();

  //   cy.findByText("Save").click();
  //   cy.findByText("You're editing this dashboard.").should("not.exist");

  //   cy.findByText("Category").click();
  //   cy.findByPlaceholderText("Search by Name")
  //     .click()
  //     .type("bb");
  //   cy.findByText("Abbie Parisian").click();
  //   cy.findByText("Add filter").click();

  //   cy.contains("of 18");
  // });
});
