import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitDashboard,
  filterWidget,
  editDashboard,
  saveDashboard,
  sidebar,
  getDashboardCard,
} from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const ccName = "Custom Category";
const ccDisplayName = "Product.Custom Category";

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

describe("issue 22788", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id, card_id, id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
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

    getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText(ccDisplayName);
    });

    // need to actually change the dashboard to test a real save
    sidebar().within(() => {
      cy.findByDisplayValue("Text").clear().type("my filter text");
      cy.button("Done").click();
    });

    saveDashboard();

    cy.findByTestId("dashboard-parameters-widget-container").within(() => {
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("my filter text");
    });

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
