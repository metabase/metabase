const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > data studio > modeling > metrics", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/collection").as("createCollection");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");
  });

  describe("empty state", () => {
    it("should show empty state when no collections are selected", () => {
      visitModelingPage();
      H.DataStudio.Modeling.emptyPage().should("be.visible");
      H.DataStudio.Modeling.emptyPage()
        .parent()
        .findByText("Build your semantic layer with models and metrics.")
        .should("be.visible");
    });
  });

  it("should create a new metric with proper validation and save to collection", () => {
    visitModelingPage();

    cy.log("Create a new metric");
    H.DataStudio.ModelingSidebar.createCardMenuButton().click();
    H.popover().findByText("Metric").click();

    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.DataStudio.Metrics.saveButton().should("be.disabled");

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover().findByText("Created At").click();

    H.DataStudio.Metrics.saveButton().should("be.enabled").click();

    H.modal().within(() => {
      cy.findByText("Save your metric").should("be.visible");
      cy.findByLabelText("Name").type("Total Revenue");
      cy.findByLabelText("Description").type(
        "Sum of all order totals across the store",
      );
      cy.findByText("Where do you want to save this?").should("be.visible");
      cy.button("Save").click();
    });

    cy.wait("@createCard");

    cy.log("Verify metric overview page");
    cy.url().should("match", /\/data-studio\/modeling\/metrics\/\d+$/);

    H.DataStudio.Metrics.overviewPage().within(() => {
      cy.findByText("Total Revenue").should("be.visible");
      cy.findByText("Sum of all order totals across the store").should(
        "be.visible",
      );
      cy.findByText("Sample Database").should("be.visible");
      cy.findByText("PUBLIC").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Creator and last editor").should("be.visible");
      cy.findAllByText(/by Bobby Tables/).should("be.visible");
    });

    cy.log("Ensure chart is visible");
    H.echartsContainer().findByText("Count").should("be.visible");

    cy.log("Verify metric definition page");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Verify notebook state");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("data").findByText("Orders").should("be.visible");
    H.getNotebookStep("summarize")
      .findByText("Created At: Month")
      .should("be.visible");

    H.runButtonInOverlay().click();
    cy.log("Ensure chart is visible");
    H.echartsContainer().findByText("Count").should("be.visible");

    cy.log("Verify metric dependencies page");
    H.DataStudio.Metrics.dependenciesTab().click();
    H.DependencyGraph.graph().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Total Revenue").should("be.visible");
    });
  });

  it("should edit metric definition and save changes", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.metricItem("Revenue Metric").click();

    cy.log("Verify metric overview page is visible");
    H.DataStudio.Metrics.overviewPage().should("be.visible");

    cy.log("Update the metric name and description");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Revenue Metric")
      .clear()
      .type("Total Revenue{enter}");

    cy.wait("@updateCard");

    H.DataStudio.Metrics.overviewPage()
      .findByPlaceholderText("No description")
      .type("Sum of all order totals{enter}");

    cy.wait("@updateCard");

    cy.log("Navigate to definition tab");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Add a breakout by Created At");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByText("Created At").click();

    cy.log("Save the changes");
    H.DataStudio.Metrics.saveButton().should("be.enabled").click();

    cy.wait("@updateCard");

    cy.log("Navigate back to overview tab");
    H.DataStudio.Metrics.overviewTab().click();

    cy.log("Verify metric name and description are updated");
    H.DataStudio.Metrics.overviewPage().within(() => {
      cy.findByText("Total Revenue").should("be.visible");
      cy.findByText("Sum of all order totals").should("be.visible");
    });

    cy.log("Verify chart shows the time series");
    H.echartsContainer().findByText("Sum of Total").should("be.visible");

    cy.log("Verify updated name appears in collection view");
    cy.visit("/data-studio/modeling/collections/root");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.metricItem("Total Revenue").should("be.visible");
  });

  it("should cancel editing and revert changes", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.metricItem("Revenue Metric").click();

    cy.log("Navigate to definition tab");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Change aggregation");
    H.getNotebookStep("summarize").findByText("Sum of Total").click();
    H.popover().findByText("Subtotal").click();

    cy.log("Verify save button is enabled, then cancel");
    H.DataStudio.Metrics.saveButton().should("be.enabled");
    H.DataStudio.Metrics.cancelButton().click();

    cy.log("Verify changes were reverted");
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .should("be.visible");
  });

  it("should show unsaved changes warning when navigating away", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    H.DataStudio.Modeling.metricItem("Revenue Metric").click();

    cy.log("Navigate to definition tab");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Change aggregation from Sum to Subtotal");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("summarize").findByText("Sum of Total").click();
    H.popover().findByText("Subtotal").click();

    cy.log("Try to navigate away");
    H.DataStudio.ModelingSidebar.glossaryLink().click();

    cy.log("Verify unsaved changes modal appears");
    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.button("Cancel").click();
    });

    cy.log("Verify we're still on the definition tab");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
  });

  it("should archive and restore a metric", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Wait for collection page to load");
    H.DataStudio.Modeling.collectionPage().should("be.visible");

    cy.log("Click on the metric from the collection view");
    cy.findByRole("table").findByText("Revenue Metric").click();

    cy.log("Archive the metric");
    H.DataStudio.Metrics.overviewPage().should("be.visible");
    H.DataStudio.Metrics.header().icon("ellipsis").click();
    H.popover().findByText("Move to trash").click();

    cy.log("Confirm archiving in modal");
    H.modal().within(() => {
      cy.findByText(/move.*to trash/i).should("be.visible");
      cy.button("Move to trash").click();
    });

    cy.wait("@updateCard");

    cy.log("Verify redirected to modeling page");
    cy.url().should("include", "/data-studio/modeling");

    cy.log("Verify metric is removed from collection view");
    cy.visit("/data-studio/modeling/collections/root");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").should("not.exist");

    cy.log("Navigate to trash");
    cy.visit("/trash");

    cy.log("Restore the metric");
    cy.findByRole("table").findByText("Revenue Metric").click();
    cy.findByTestId("archive-banner").findByText("Restore").click();
    cy.wait("@updateCard");

    cy.log("Verify metric is restored in collection view");
    cy.visit("/data-studio/modeling/collections/root");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").should("be.visible");
  });

  it("should view metric in question view via more menu", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    }).then(({ body: card }) => {
      cy.log("Navigate to Our analytics collection");
      cy.visit("/data-studio/modeling/collections/root");

      cy.log("Click on the metric from the collection view");
      H.DataStudio.Modeling.collectionPage().should("be.visible");
      cy.findByRole("table").findByText("Revenue Metric").click();

      cy.log("Verify View link opens in new tab");
      H.DataStudio.Metrics.overviewPage().should("be.visible");
      H.DataStudio.Metrics.moreMenu().click();
      H.popover()
        .findByText("View")
        .closest("a")
        .should("have.attr", "target", "_blank")
        .should("have.attr", "href")
        .and("include", `/metric/${card.id}`);
    });
  });

  it("should duplicate metric via more menu", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").click();

    cy.log("Open more menu and click Duplicate");
    H.DataStudio.Metrics.overviewPage().should("be.visible");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();

    cy.log("Save duplicate metric");
    H.modal().findByText('Duplicate "Revenue Metric"').should("be.visible");
    H.modal()
      .findByLabelText("Name")
      .should("have.value", "Revenue Metric - Duplicate");
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();
    H.entityPickerModalTab("Collections").click();
    H.entityPickerModal().findByText("Our analytics").click();
    H.entityPickerModal().button("Select this collection").click();
    H.modal().button("Duplicate").click();

    cy.wait("@createCard");

    cy.log("Verify duplicate metric is created");
    H.DataStudio.Metrics.overviewPage()
      .findByText("Revenue Metric - Duplicate")
      .should("be.visible");

    cy.log("Verify both metrics appear in collection view");
    cy.visit("/data-studio/modeling/collections/root");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").should("be.visible");
    cy.findByRole("table")
      .findByText("Revenue Metric - Duplicate")
      .should("be.visible");
  });

  it("should move metric to different collection via more menu", () => {
    H.createQuestion({
      name: "Revenue Metric",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    cy.log("Navigate to Our analytics collection");
    cy.visit("/data-studio/modeling/collections/root");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").click();

    cy.log("Open more menu and click Move");
    H.DataStudio.Metrics.overviewPage().should("be.visible");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move").click();

    cy.log("Select First collection as destination");
    H.entityPickerModal().findByText("First collection").click();
    H.entityPickerModal().button("Move").click();

    cy.wait("@updateCard");

    cy.log("Verify metric is no longer in Our analytics");
    cy.visit("/data-studio/modeling/collections/root");
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").should("not.exist");

    cy.log("Verify metric is in First collection");
    H.DataStudio.ModelingSidebar.collectionsTree()
      .findByText("First collection")
      .click();
    H.DataStudio.Modeling.collectionPage().should("be.visible");
    cy.findByRole("table").findByText("Revenue Metric").should("be.visible");
  });
});

function visitModelingPage() {
  cy.visit("/data-studio/modeling");
  H.DataStudio.ModelingSidebar.root().should("be.visible");
}
