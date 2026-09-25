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

    cy.log("Without a default dimension the preview is a scalar");
    H.DataStudio.Metrics.aboutPage()
      .findByTestId("scalar-value")
      .should("have.text", "18,760");

    cy.log("Verify metric definition page");
    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Verify notebook state");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("data").findByText("Orders").should("be.visible");
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");

    H.runButtonInOverlay().click();
    cy.log("Ensure the result is visible");
    cy.findByTestId("scalar-value").should("have.text", "18,760");

    cy.log("Verify metric dependencies page");
    H.waitForBackfillComplete();
    cy.reload();
    H.DataStudio.Metrics.dependenciesTab().click();
    H.DependencyGraph.graph().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Total Revenue").should("be.visible");
    });
  });

  it("should rename, cache, duplicate and move a metric", () => {
    cy.intercept("PUT", "/api/cache").as("updateCacheConfig");

    visitMetricPage();

    cy.log("Rename the metric");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .clear()
      .type("Updated Orders Metric{enter}");

    cy.wait("@updateCard");

    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Updated Orders Metric")
      .should("be.visible");

    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .request("GET", `/api/card/${id}`)
        .its("body.name")
        .should("eq", "Updated Orders Metric"),
    );

    cy.log("Change the caching strategy to Duration and save");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Caching").click();
    H.modal()
      .findByTestId("cache-strategy-select")
      .should("have.value", "Default")
      .click();
    // The Select dropdown renders in a portal; wait for it to open, then pick.
    H.selectDropdown()
      .findByRole("option", { name: /Duration/ })
      .click();
    H.fillCacheDuration(24);
    H.modal().findByTestId("strategy-form-submit-button").click();

    cy.wait("@updateCacheConfig");
    H.modal().should("not.exist");

    cy.log("Re-open the caching settings to verify the change is persisted");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Caching").click();
    H.modal()
      .findByTestId("cache-strategy-select")
      .should("have.value", "Duration");
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");

    cy.log("Duplicate the metric into the Metrics collection");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();

    H.modal()
      .findByText('Duplicate "Updated Orders Metric"')
      .should("be.visible");
    H.modal()
      .findByLabelText("Name")
      .should("have.value", "Updated Orders Metric - Duplicate");
    H.modal().findByTestId("dashboard-and-collection-picker-button").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Library").click();
      cy.findByText("Metrics").click();
      cy.button("Select this collection").click();
    });

    H.modal().button("Duplicate").click();

    cy.wait("@createCard").its("response.body.id").as("duplicateMetricId");
    H.modal().should("not.exist");

    H.DataStudio.Metrics.aboutPage()
      .findAllByText("Updated Orders Metric - Duplicate")
      .should("have.length", 2); // breadcrumbs + header

    cy.get<number>("@metricsCollectionId").then((collectionId) =>
      cy
        .request("GET", `/api/collection/${collectionId}/items`)
        .its("body.data")
        .should((items: { name: string }[]) => {
          const names = items.map((item) => item.name);
          expect(names).to.include("Updated Orders Metric");
          expect(names).to.include("Updated Orders Metric - Duplicate");
        }),
    );

    cy.log("Move the duplicate to First collection");
    cy.intercept("PUT", "/api/card/*").as("moveCard");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move").click();
    H.pickEntity({ path: ["Our analytics", "First collection"], select: true });

    cy.wait("@moveCard");

    cy.findByTestId("move-card-toast").findByText("First collection").click();

    cy.get<number>("@duplicateMetricId").then((id) =>
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

  it("should warn about unsaved definition changes and revert them on cancel", () => {
    visitMetricPage();

    H.DataStudio.Metrics.definitionTab().click();

    cy.log("Change aggregation from Count to Sum of Total");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().findByText("Sum of ...").click();
    H.popover().findByText("Total").click();
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .should("be.visible");

    cy.log("Navigating away prompts to discard the changes");
    H.DataStudio.nav().findByRole("link", { name: "Glossary" }).click();

    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.button("Cancel").click();
    });

    cy.log("Staying keeps the edited definition");
    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .should("be.visible");

    cy.log("Cancel reverts the definition");
    H.DataStudio.Metrics.saveButton().should("be.enabled");
    H.DataStudio.Metrics.cancelButton().click();
    H.getNotebookStep("summarize").findByText("Count").should("be.visible");
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
});
