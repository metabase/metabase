const { H } = cy;
import { createLibraryWithItems } from "e2e/support/test-library-data";

describe("scenarios > data studio > library > metrics", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    // Needs cloud because the "No notification channels" banner takes up too much space and the run button is not clickable
    H.activateToken("pro-cloud");

    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/collection").as("createCollection");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");

    createLibraryWithItems();
  });

  // Navigate straight to the metric's page by id. Clicking it out of the
  // library tree is flaky because rows lazy-load per subcollection.
  const visitMetricPage = () =>
    cy
      .get<number>("@trustedMetricId")
      .then((id) => cy.visit(`/data-studio/library/metrics/${id}`));

  it("should create a new metric with proper validation and save to collection", () => {
    H.DataStudio.Library.visit();

    cy.log("Create a new metric");
    H.DataStudio.Library.newButton().click();
    H.popover().findByText("Metric").click();

    cy.log("Verify metric_create_started event was tracked");
    H.expectUnstructuredSnowplowEvent({
      event: "metric_create_started",
      triggered_from: "data_studio_library",
    });

    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.DataStudio.Metrics.saveButton().should("be.disabled");

    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover().findByText("Created At").click();

    H.DataStudio.Metrics.saveButton().should("be.enabled").click();

    H.modal().within(() => {
      cy.findByText("Save your metric").should("be.visible");
      cy.findByLabelText("Name").clear().type("Total Revenue");
      cy.findByLabelText("Description").type(
        "Sum of all order totals across the store",
      );
      cy.findByText("Where do you want to save this?").should("be.visible");
      cy.button("Save").click();
    });

    cy.wait("@createCard");

    cy.log("Verify metric_created event was tracked");
    H.expectUnstructuredSnowplowEvent({
      event: "metric_created",
      triggered_from: "data_studio",
      result: "success",
    });

    cy.log("Verify metric overview page");
    cy.url().should("match", /\/data-studio\/library\/metrics\/\d+$/);

    H.DataStudio.Metrics.aboutPage().within(() => {
      cy.findAllByText("Total Revenue").should("have.length", 2); // breadcrumbs + header
      cy.findByText("Sum of all order totals across the store").should(
        "be.visible",
      );
    });

    H.DataStudio.Metrics.aboutPageDescriptionSidebar().within(() => {
      cy.findByText(/^Last updated/).should("be.visible");

      cy.findByText("Source").should("be.visible");
      cy.findByText("Sample Database").should("be.visible");
      cy.findByText("Orders").should("be.visible");

      cy.findByText("Relationships").should("be.visible");
      cy.findByText("No dependencies").should("be.visible");
      cy.findByText("No charts use this metric").should("be.visible");
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
    H.waitForBackfillComplete();
    cy.reload();
    H.DataStudio.Metrics.dependenciesTab().click();
    H.DependencyGraph.graph().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Total Revenue").should("be.visible");
    });
  });

  it("should edit metric definition and save changes", () => {
    visitMetricPage();

    cy.log("Verify metric overview page displays correct data");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Update the metric name");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .clear()
      .type("Updated Orders Metric{enter}");

    cy.wait("@updateCard");

    cy.log("Verify updated name appears in overview");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Updated Orders Metric")
      .should("be.visible");

    cy.log("Verify the new name persisted");
    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .request("GET", `/api/card/${id}`)
        .its("body.name")
        .should("eq", "Updated Orders Metric"),
    );
  });

  it("should cancel editing and revert changes", () => {
    visitMetricPage();

    cy.log("Navigate to definition tab");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Change aggregation");
    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().findByText("Sum of ...").click();
    H.popover().findByText("Total").click();

    cy.log("Verify save button is enabled, then cancel");
    H.DataStudio.Metrics.saveButton().should("be.enabled");
    H.DataStudio.Metrics.cancelButton().click();

    cy.log("Verify changes were reverted");
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");
  });

  it("should show unsaved changes warning when navigating away", () => {
    visitMetricPage();

    cy.log("Navigate to definition tab");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Change aggregation from Count to Sum");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().findByText("Sum of ...").click();
    H.popover().findByText("Total").click();

    cy.log("Try to navigate away");
    H.DataStudio.nav().findByRole("link", { name: "Glossary" }).click();

    cy.log("Verify unsaved changes modal appears");
    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.button("Cancel").click();
    });

    cy.log("Verify we're still on the definition tab");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
  });

  it("should archive and restore a metric", () => {
    visitMetricPage();

    cy.log("Verify metric is loaded before archiving");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Archive the metric");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move to trash").click();

    cy.log("Confirm archiving in modal");
    H.modal().button("Move to trash").click();

    cy.wait("@updateCard");

    cy.log("Verify redirected to the library");
    cy.url().should("include", "/data-studio/library");

    cy.log("Verify the metric is archived");
    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .request("GET", `/api/card/${id}`)
        .its("body.archived")
        .should("eq", true),
    );

    cy.log("Navigate to trash");
    cy.visit("/trash");

    cy.log("Verify metric appears in trash");
    cy.findByRole("table")
      .findByText("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Restore the metric");
    cy.findByRole("table").findByText("Trusted Orders Metric").click();
    cy.findByTestId("archive-banner").should("be.visible");
    cy.findByTestId("archive-banner").findByText("Restore").click();
    cy.wait("@updateCard");

    cy.log("Verify the metric is restored");
    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .request("GET", `/api/card/${id}`)
        .its("body.archived")
        .should("eq", false),
    );
  });

  it("should view metric in the metrics explorer view via the Explore button", () => {
    visitMetricPage();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Verify the Explore button points to the metrics explorer");
    H.DataStudio.Metrics.exploreLink()
      .should("have.attr", "href")
      .and("match", /\/explore\?metricId=\d+/);
  });

  it("should duplicate metric via more menu", () => {
    visitMetricPage();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Open more menu and click Duplicate");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();

    cy.log("Save duplicate metric");
    H.modal()
      .findByText('Duplicate "Trusted Orders Metric"')
      .should("be.visible");
    H.modal()
      .findByLabelText("Name")
      .should("have.value", "Trusted Orders Metric - Duplicate");
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Library").click();
      cy.findByText("Metrics").click();
      cy.button("Select this collection").click();
    });

    H.modal().button("Duplicate").click();

    cy.wait("@createCard");
    H.modal().should("not.exist");

    cy.log("Verify duplicate metric is created");
    H.DataStudio.Metrics.aboutPage()
      .findAllByText("Trusted Orders Metric - Duplicate")
      .should("have.length", 2); // breadcrumbs + header

    cy.log("Verify both metrics live in the Metrics collection");
    cy.get<number>("@metricsCollectionId").then((collectionId) =>
      cy
        .request("GET", `/api/collection/${collectionId}/items`)
        .its("body.data")
        .then((items: { name: string }[]) => {
          const names = items.map((item) => item.name);
          expect(names).to.include("Trusted Orders Metric");
          expect(names).to.include("Trusted Orders Metric - Duplicate");
        }),
    );
  });

  it("should move metric to different collection via more menu", () => {
    visitMetricPage();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Open more menu and click Move");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move").click();

    cy.log("Select First collection as destination");
    H.pickEntity({ path: ["Our analytics", "First collection"], select: true });

    cy.wait("@updateCard");

    cy.log("Verify metric is in First collection");
    cy.findByTestId("move-card-toast").findByText("First collection").click();

    cy.log("Verify the metric left the Metrics collection");
    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .get<number>("@metricsCollectionId")
        .then((metricsCollectionId) =>
          cy
            .request("GET", `/api/card/${id}`)
            .its("body.collection_id")
            .should("not.eq", metricsCollectionId),
        ),
    );
  });

  describe("analytics events", () => {
    it("should track metric_create_started and metric_created from browse metrics", () => {
      cy.visit("/browse/metrics");

      cy.log("Click the plus button to create a new metric");
      cy.findByRole("link", { name: "Create a new metric" }).click();

      cy.log("Verify metric_create_started event was tracked");
      H.expectUnstructuredSnowplowEvent({
        event: "metric_create_started",
        triggered_from: "browse_metrics",
      });

      cy.log("Verify we're on the new metric page");
      cy.url().should("match", /\/metric\/new/);

      cy.findByPlaceholderText(/Search for tables/).type("Orders");
      H.popover()
        .findAllByRole("menuitem", { name: /Orders/ })
        .should("have.length.gte", 1);
      H.popover()
        .findAllByRole("menuitem", { name: /Orders/ })
        .first()
        .click();
      cy.findByRole("button", { name: "Save" }).click();
      cy.findByRole("dialog").findByRole("button", { name: "Save" }).click();

      cy.log("Verify metric_created event was tracked");
      H.expectUnstructuredSnowplowEvent({
        event: "metric_created",
      });
    });

    it("should track metric_create_started from command palette", () => {
      cy.visit("/");

      cy.log("Open command palette and create metric");
      H.openCommandPalette();
      H.commandPaletteSearch("metric", false);
      cy.findByRole("option", { name: /New metric/ }).click();

      cy.log("Verify metric_create_started event was tracked");
      H.expectUnstructuredSnowplowEvent({
        event: "metric_create_started",
        triggered_from: "command_palette",
      });

      cy.log("Verify we're on the new metric page");
      cy.url().should("match", /\/metric\/new/);
    });
  });

  describe("caching", () => {
    it("should allow changing metric caching settings", () => {
      cy.intercept("PUT", "/api/cache").as("updateCacheConfig");

      visitMetricPage();

      cy.log("Open the caching settings from the overflow menu");
      H.DataStudio.Metrics.moreMenu().click();
      H.popover().findByText("Caching").click();

      cy.log("Change the strategy to Duration and save");
      H.modal()
        .findByTestId("cache-strategy-select")
        .should("have.value", "Default")
        .click();
      // The Select dropdown renders in a portal; wait for it to open, then pick.
      H.selectDropdown()
        .findByRole("option", { name: /Duration/ })
        .click();
      H.modal().findByTestId("strategy-form-submit-button").click();

      cy.wait("@updateCacheConfig");

      cy.log("Saving persists the change and closes the modal");
      H.modal().should("not.exist");

      cy.log("Re-open the caching settings to verify the change is persisted");
      H.DataStudio.Metrics.moreMenu().click();
      H.popover().findByText("Caching").click();
      H.modal()
        .findByTestId("cache-strategy-select")
        .should("have.value", "Duration");
    });
  });
});
