const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const TREEMAP_QUERY = `
SELECT 'Legumes' AS category, 'Chickpeas' AS item, 50 AS sales
UNION ALL SELECT 'Legumes', 'Lentils', 40
UNION ALL SELECT 'Legumes', 'Black Beans', 30
UNION ALL SELECT 'Grains', 'Quinoa', 35
UNION ALL SELECT 'Grains', 'Brown Rice', 45
UNION ALL SELECT 'Nuts', 'Almonds', 40
UNION ALL SELECT 'Nuts', 'Walnuts', 35;
`;

function treemapBreadcrumb() {
  return cy.findByTestId("treemap-breadcrumb");
}

describe("scenarios > visualizations > treemap", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render and configure a treemap in the query builder", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "native",
        native: { query: TREEMAP_QUERY },
        database: SAMPLE_DB_ID,
      },
    });

    cy.log("Switch to the Treemap visualization");
    H.openVizTypeSidebar();
    cy.findByTestId("Treemap-button").click();

    cy.log("Top-level groups and leaf tiles render");
    H.echartsContainer()
      .should("contain", "Legumes")
      .and("contain", "Grains")
      .and("contain", "Nuts")
      .and("contain", "Chickpeas");

    cy.log("Toggle leaf labels off and on");
    H.openVizSettingsSidebar();
    cy.findByTestId("chartsettings-sidebar")
      .as("settings-sidebar")
      .findByText("Display")
      .click();

    cy.get("@settings-sidebar").findByText("Show leaf labels").click();

    H.echartsContainer()
      .should("contain", "Legumes")
      .and("not.contain", "Chickpeas");

    cy.get("@settings-sidebar").findByText("Show leaf labels").click();
    H.echartsContainer().should("contain", "Chickpeas");

    cy.log("Saving the question works");
    cy.findByTestId("qb-save-button").click();
    cy.findByPlaceholderText("What is the name of your question?").type(
      "My Treemap",
    );
    cy.findByTestId("save-question-modal").findByText("Save").click();
    H.checkSavedToCollectionQuestionToast();
  });

  it("should drill into a group and navigate back via the breadcrumb", () => {
    H.visitQuestionAdhoc({
      display: "treemap",
      dataset_query: {
        type: "native",
        native: { query: TREEMAP_QUERY },
        database: SAMPLE_DB_ID,
      },
    });

    cy.log("Overview breadcrumb shows the grand total");
    treemapBreadcrumb().should("contain", "Total");
    H.echartsContainer()
      .should("contain", "Legumes")
      .and("contain", "Grains")
      .and("contain", "Nuts");

    cy.log("Clicking a group drills into it");
    H.echartsContainer().findByText("Legumes").click();

    treemapBreadcrumb()
      .findByRole("button", { name: "Legumes" })
      .should("be.visible");
    H.echartsContainer()
      .should("contain", "Chickpeas")
      .and("contain", "Lentils")
      .and("not.contain", "Quinoa");

    cy.log("Back button returns to the overview");
    treemapBreadcrumb().findByRole("button", { name: "Legumes" }).click();

    treemapBreadcrumb().should("contain", "Total");
    H.echartsContainer().should("contain", "Grains").and("contain", "Nuts");
  });

  it("should drill through from a tile", () => {
    H.visitQuestionAdhoc({
      display: "treemap",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
      },
    });

    cy.log("One-level treemap renders the category tiles");
    H.echartsContainer()
      .should("contain", "Doohickey")
      .and("contain", "Widget");

    cy.log("Clicking a tile drills through to a filtered view");
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.echartsContainer().findByText("Doohickey").click();
    H.popover().findByText("See these Orders").click();

    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("Product → Category is Doohickey")
      .should("be.visible");
  });
});
