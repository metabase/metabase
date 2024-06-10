import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  visitDashboard,
  editDashboard,
  saveDashboard,
  filterWidget,
  getDashboardCard,
} from "e2e/support/helpers";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "27768",
  query: {
    "source-table": PRODUCTS_ID,
    limit: 5,
    expressions: { CCategory: ["field", PRODUCTS.CATEGORY, null] },
  },
};

const filter = {
  name: "Cat",
  slug: "cat",
  id: "b3b436dd",
  type: "string/=",
  sectionId: "string",
};

describe("issue 27768", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [filter],
        });

        visitDashboard(dashboard_id, { queryParams: { cat: "Gizmo" } });
      },
    );
  });

  it("filter connected to custom column should visually indicate it is connected (metabase#27768)", () => {
    // We need to manually connect the filter to the custom column using the UI,
    // but when we fix the issue, it should be safe to do this via API
    editDashboard();
    getFilterOptions(filter.name);

    getDashboardCard().findByText("Select…").click();
    popover().contains("CCategory").click();
    saveDashboard();

    filterWidget().click();
    popover().findByText("Gizmo").click();
    cy.button("Add filter").click();

    cy.findAllByText("Doohickey").should("not.exist");

    // Make sure the filter is still connected to the custom column
    editDashboard();
    getFilterOptions(filter.name);

    getDashboardCard().within(() => {
      cy.findByText("Select…").should("not.exist");
      cy.contains("Product.CCategory");
    });
  });
});

function getFilterOptions(filterName) {
  cy.findByText(filterName).find(".Icon-gear").click();
}
