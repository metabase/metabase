const { H } = cy;
import { createLibraryWithItems } from "e2e/support/test-library-data";

describe("scenarios > data studio > library > metrics", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/collection").as("createCollection");
    cy.intercept("PUT", "/api/collection/*").as("updateCollection");

    createLibraryWithItems();
  });

  it("should create a new metric with proper validation and save to collection", () => {
    H.DataStudio.Library.visit();

    cy.log("Create a new metric");
    H.DataStudio.Library.newButton().click();
    H.popover().findByText("Metric").click();

    H.DataStudio.Metrics.queryEditor().should("be.visible");
    H.DataStudio.Metrics.saveButton().should("be.disabled");

    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      cy.findByText("Databases").click();
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
    cy.url().should("match", /\/data-studio\/library\/metrics\/\d+$/);

    H.DataStudio.Metrics.overviewPage().within(() => {
      cy.findAllByText("Total Revenue").should("have.length", 2); // breadcrumbs + header
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

  it("should edit metric definition and save changes", function () {
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

    cy.log("Verify metric overview page displays correct data");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Update the metric name");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Trusted Orders Metric")
      .clear()
      .type("Updated Orders Metric{enter}");

    cy.wait("@updateCard");

    cy.log("Verify updated name appears in overview");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Updated Orders Metric")
      .should("be.visible");

    cy.log("Verify updated name appears in collection view");
    cy.visit("/data-studio/library");
    H.DataStudio.Library.metricItem("Updated Orders Metric").should(
      "be.visible",
    );
  });

  it("should cancel editing and revert changes", () => {
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

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
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

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
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

    cy.log("Verify metric is loaded before archiving");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Archive the metric");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move to trash").click();

    cy.log("Confirm archiving in modal");
    H.modal().button("Move to trash").click();

    cy.wait("@updateCard");

    cy.log("Verify redirected to library page");
    cy.url().should("include", "/data-studio/library");

    cy.log("Verify metric is removed from collection view");
    cy.visit("/data-studio/library");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .should("not.exist");

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

    cy.log("Verify metric is restored in collection view");
    cy.visit("/data-studio/library");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .should("be.visible");
  });

  it("should view metric in question view via more menu", () => {
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Verify View link opens in new tab");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover()
      .findByText("View")
      .closest("a")
      .should("have.attr", "target", "_blank")
      .should("have.attr", "href")
      .and("match", /\/metric\/\d+/);
  });

  it("should duplicate metric via more menu", () => {
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.overviewPage()
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

    H.entityPickerModalTab("Collections").click();
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
    H.DataStudio.Metrics.overviewPage()
      .findAllByText("Trusted Orders Metric - Duplicate")
      .should("have.length", 2); // breadcrumbs + header

    cy.log("Verify both metrics appear in collection view");
    H.DataStudio.nav().findByRole("link", { name: "Library" }).click();
    H.DataStudio.Library.libraryPage().within(() => {
      cy.findByText("Trusted Orders Metric").should("be.visible");
      cy.findByText("Trusted Orders Metric - Duplicate").should("be.visible");
    });
  });

  it("should move metric to different collection via more menu", () => {
    cy.log("Navigate to Data Studio Library");
    cy.visit("/data-studio/library");

    cy.log("Click on the metric from the collection view");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .click();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.overviewPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Open more menu and click Move");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move").click();

    cy.log("Select First collection as destination");
    H.entityPickerModal().findByText("First collection").click();
    H.entityPickerModal().button("Move").click();

    cy.wait("@updateCard");

    cy.log("Verify metric is in First collection");
    cy.findByTestId("move-card-toast").findByText("First collection").click();

    cy.log("Verify metric is no longer in Metrics collection");
    cy.visit("/data-studio/library");
    H.DataStudio.Library.libraryPage()
      .findByText("Trusted Orders Metric")
      .should("not.exist");
  });

  describe("caching", () => {
    it("should allow changing metric caching settings", () => {
      cy.log("Navigate to Data Studio Library");
      cy.visit("/data-studio/library");

      cy.log("Click on the metric from the collection view");
      H.DataStudio.Library.metricItem("Trusted Orders Metric").click();

      cy.log("Navigate to caching tab");
      H.DataStudio.Metrics.cachingTab().click();

      cy.log("Change the setting and save");
      cy.findByRole("radio", { name: /Use default/ }).should("be.checked");
      cy.findByRole("radio", { name: /Duration/ }).click();
      cy.findByRole("button", { name: "Save" }).click();
      cy.findByRole("button", { name: /Saved/ }).should("exist");

      // wait for the save button to disappear - that means the form is no longer dirty
      // and navigating away won't show the confirmation modal that was causing flakes
      cy.findByRole("button", { name: /Saved/ }).should("not.exist");

      cy.log("Navigate away and come back to verify the change is persisted");
      H.DataStudio.Metrics.overviewTab().click();
      H.DataStudio.Metrics.cachingTab().click();
      cy.findByRole("radio", { name: /Duration/ }).should("be.checked");
    });
  });
});
