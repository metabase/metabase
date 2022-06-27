import {
  restore,
  visitDashboard,
  filterWidget,
  editDashboard,
  saveDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const ccName = "Custom Category";

const questionDetails = {
  name: "22788",
  query: {
    "source-table": PRODUCTS_ID,
    expressions: { [ccName]: ["field", PRODUCTS.CATEGORY, null] },
    limit: 5,
  },
};

const filter = {
  name: "Text",
  slug: "text",
  id: "a7565817",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  name: "22788D",
  parameters: [filter],
};

describe.skip("issue 22788", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id, card_id, id } }) => {
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
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["expression", ccName, null]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("should not drop filter connected to a custom column on a second dashboard edit (metabase#22788)", () => {
    addFilterAndAssert();

    editDashboard();

    openFilterSettings();

    // Make sure the filter is still connected to the custom column
    cy.findByText("Column to filter on")
      .parent()
      .within(() => {
        cy.findByText(ccName);
      });

    saveDashboard();

    addFilterAndAssert();
  });
});

function addFilterAndAssert() {
  filterWidget().click();
  cy.findByPlaceholderText("Enter some text").type("Gizmo{enter}");
  cy.button("Add filter").click();

  cy.findAllByText("Gizmo");
  cy.findAllByText("Doohickey").should("not.exist");
}

function openFilterSettings() {
  cy.findByTestId("edit-dashboard-parameters-widget-container")
    .find(".Icon-gear")
    .click();
}
