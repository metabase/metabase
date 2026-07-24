const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { ListMetricDimensionsResponse } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders count",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

// ID, User ID, Product ID, Subtotal, Tax, Total, Discount, Created At, Quantity
const SEEDED_DIMENSIONS_COUNT = 9;

const dimensionList = () => cy.findByTestId("metric-dimension-list");
const dimensionRow = (name: string) => cy.findByTestId(`dimension-row-${name}`);
const allDimensionRows = () => cy.findAllByTestId(/^dimension-row-/);
const addDimensionsPanel = () => cy.findByTestId("add-dimensions-panel");
const settingsPanel = () => cy.findByTestId("dimension-settings-panel");

describe("scenarios > metrics > dimensions", () => {
  let metricId: number;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Dimension ids are UUIDs, which keeps this from also matching the
    // fixed-word routes below.
    cy.intercept("POST", /\/api\/metric\/\d+\/dimension\/[0-9a-f-]{36}$/).as(
      "updateDimension",
    );
    cy.intercept("POST", "/api/metric/*/dimension/add").as("addDimensions");
    cy.intercept("POST", "/api/metric/*/dimension/remove").as(
      "removeDimensions",
    );
    cy.intercept("POST", "/api/metric/*/dimension/reorder").as(
      "reorderDimensions",
    );
    cy.intercept("POST", "/api/metric/*/dimension/set-default").as(
      "setDefaultDimension",
    );
    cy.intercept("GET", "/api/metric/*/dimension*").as("listDimensions");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body }) => {
      metricId = body.id;
      // Reading a metric seeds its curated dimension list with the
      // metric's own table columns.
      cy.request("GET", `/api/metric/${body.id}`);
    });
  });

  it("curates the dimension list: seeded columns, add, rename, set default, and remove", () => {
    H.visitMetric(metricId);
    H.MetricPage.dimensionsTab().click();
    H.MetricPage.dimensionsPage().should("be.visible");

    cy.log(
      "seeding added the metric's own table columns, but none from connected tables",
    );
    allDimensionRows().should("have.length", SEEDED_DIMENSIONS_COUNT);
    dimensionList()
      .should("contain", "Created At")
      .and("contain", "Total")
      .and("contain", "Quantity")
      .and("not.contain", "Vendor");

    cy.log("add a dimension from a connected table");
    dimensionList()
      .findByRole("button", { name: "Available dimensions" })
      .click();
    addDimensionsPanel().should("contain", "Product").and("contain", "User");
    addDimensionsPanel().findByText("Category").click();
    cy.wait("@addDimensions");
    dimensionRow("Product - Category").scrollIntoView().should("be.visible");
    addDimensionsPanel().findByRole("button", { name: "Done" }).click();
    allDimensionRows().should("have.length", SEEDED_DIMENSIONS_COUNT + 1);
    addDimensionsPanel().should("not.exist");

    cy.log("rename the added dimension from its settings panel");
    dimensionRow("Product - Category").findByText("Product - Category").click();
    settingsPanel().should("contain", "Settings for Product - Category");
    settingsPanel()
      .findByLabelText("Display name")
      .clear()
      .type("Product type")
      .blur();
    cy.wait("@updateDimension");
    dimensionRow("Product type").scrollIntoView().should("be.visible");
    settingsPanel().should("contain", "Settings for Product type");

    cy.log("give it a description");
    settingsPanel()
      .findByLabelText("Description")
      .type("Category of the ordered product")
      .blur();
    cy.wait("@updateDimension");

    cy.log("make it the default dimension");
    dimensionRow("Created At").findByText("Default").should("be.visible");
    dimensionList().findAllByText("Default").should("have.length", 1);
    settingsPanel().findByRole("button", { name: "Set as default" }).click();
    cy.wait("@setDefaultDimension");
    dimensionRow("Product type")
      .scrollIntoView()
      .findByText("Default")
      .should("be.visible");
    dimensionRow("Created At").findByText("Default").should("not.exist");
    settingsPanel().findByText("Default dimension").should("be.visible");
    dimensionList().findAllByText("Default").should("have.length", 1);

    cy.log("the edits are persisted");
    cy.request<ListMetricDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension`,
    ).then(({ body }) => {
      const renamed = body.added.find(
        (dimension) => dimension.display_name === "Product type",
      );
      expect(renamed?.description).to.equal("Category of the ordered product");
      expect(renamed?.default).to.equal(true);
    });

    cy.log("bulk remove checked dimensions");
    dimensionRow("Product type").findByLabelText("Product type").click();
    dimensionRow("Tax").findByLabelText("Tax").click();
    dimensionList()
      .findByRole("button", { name: "Available dimensions" })
      .should("be.disabled");
    dimensionList().findByLabelText("Remove").click();
    cy.wait("@removeDimensions");
    allDimensionRows().should("have.length", SEEDED_DIMENSIONS_COUNT - 1);
    dimensionList()
      .should("not.contain", "Product type")
      .and("not.contain", "Tax");
  });

  it("filters with search and persists a drag-and-drop reorder", () => {
    cy.visit(`/metric/${metricId}/dimensions`);
    cy.wait("@listDimensions");
    allDimensionRows().should("have.length", SEEDED_DIMENSIONS_COUNT);

    cy.log("search filters the added dimensions");
    dimensionList().findByPlaceholderText("Search…").type("Disc");
    allDimensionRows().should("have.length", 1);
    dimensionRow("Discount").should("be.visible");
    dimensionList().findByPlaceholderText("Search…").clear();
    allDimensionRows().should("have.length", SEEDED_DIMENSIONS_COUNT);

    cy.log("drag Quantity to the top of the list");
    allDimensionRows().first().should("not.contain", "Quantity");
    // Scoped through the list: during a drag the DragOverlay portal renders a
    // clone of the row with the same test ids, and re-running an unscoped
    // query would match both.
    dimensionList()
      .findByTestId("dimension-row-Quantity")
      .findByTestId("dimension-drag-handle")
      .as("dragHandle");
    allDimensionRows()
      .first()
      .then(($firstRow) => {
        dimensionRow("Quantity").then(($sourceRow) => {
          // Overshoot past the first row's top so the dragged row's center
          // clearly crosses above it.
          const vertical =
            $firstRow[0].getBoundingClientRect().top -
            $sourceRow[0].getBoundingClientRect().top -
            30;
          H.moveDnDKitElementByAlias("@dragHandle", { vertical });
        });
      });
    cy.wait("@reorderDimensions");
    allDimensionRows().first().should("contain", "Quantity");

    cy.log("the new order is persisted");
    cy.request<ListMetricDimensionsResponse>(
      "GET",
      `/api/metric/${metricId}/dimension`,
    )
      .its("body.added.0.display_name")
      .should("equal", "Quantity");
  });
});
