import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  visitDashboard,
  getDashboardCard,
  popover,
  restore,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("44266", () => {
  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "44266",
    parameters: [filterDetails],
  };

  const regularQuestion = {
    name: "regular",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const nativeQuestion = {
    name: "native",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
      },
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping when native and regular questions can be mapped (metabase#44266)", () => {
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [regularQuestion, nativeQuestion],
    }).then(({ dashboard }) => {
      visitDashboard(dashboard.id);
      editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Equal to")
        .click();

      getDashboardCard(1).findByText("Select…").click();

      popover().findByText("Price").click();

      getDashboardCard(1).findByText("Price").should("be.visible");
    });
  });
});
