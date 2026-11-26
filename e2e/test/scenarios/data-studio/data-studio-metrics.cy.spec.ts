const { H } = cy;
import { createLibraryWithItems } from "e2e/support/test-library-data";

// The UI details of these flows (form validation, modal contents, request
// bodies, analytics variants) are covered by Jest tests, mainly in
// enterprise/frontend/src/metabase-enterprise/data-studio/library/metrics/metric-pages.unit.spec.tsx.
// These tests check that the writes go through the real backend.
describe("scenarios > data studio > library > metrics", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    // Needs cloud because the "No notification channels" banner takes up too much space and the run button is not clickable
    H.activateToken("pro-cloud");

    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    createLibraryWithItems();
  });

  // Navigate straight to the metric's page by id. Clicking it out of the
  // library tree is flaky because rows lazy-load per subcollection.
  const visitMetricPage = () =>
    cy
      .get<number>("@trustedMetricId")
      .then((id) => cy.visit(`/data-studio/library/metrics/${id}`));

  it("should create a new metric and save it to a collection", () => {
    H.DataStudio.Library.visit();

    cy.log("Create a new metric");
    H.DataStudio.Library.newButton().click();
    H.popover().findByText("Metric").click();

    cy.log("Verify metric_create_started event was tracked");
    H.expectUnstructuredSnowplowEvent({
      event: "metric_create_started",
      triggered_from: "data_studio_library",
    });

    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });

    H.DataStudio.Metrics.saveButton().click();

    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("Total Revenue");
      cy.findByLabelText("Description").type(
        "Sum of all order totals across the store",
      );
      cy.button("Save").click();
    });

    cy.wait("@createCard");

    cy.log("Verify metric_created event was tracked");
    H.expectUnstructuredSnowplowEvent({
      event: "metric_created",
      triggered_from: "data_studio",
      result: "success",
    });

    cy.url().should("match", /\/data-studio\/library\/metrics\/\d+$/);

    cy.log("Verify the saved metric after a reload");
    cy.reload();
    H.DataStudio.Metrics.aboutPage().within(() => {
      cy.findAllByText("Total Revenue").should("have.length", 2); // breadcrumbs + header
      cy.findByText("Sum of all order totals across the store").should(
        "be.visible",
      );
    });

    cy.log("Without a default dimension the preview is a scalar");
    H.DataStudio.Metrics.aboutPage()
      .findByTestId("scalar-value")
      .should("have.text", "18,760");

    cy.log("Verify metric dependencies page");
    H.waitForBackfillComplete();
    cy.reload();
    H.DataStudio.Metrics.dependenciesTab().click();
    H.DependencyGraph.graph().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Total Revenue").should("be.visible");
    });
  });

  it("should rename the metric and persist its caching settings", () => {
    cy.intercept("PUT", "/api/cache").as("updateCacheConfig");

    visitMetricPage();

    cy.log("Update the metric name");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .clear()
      .type("Updated Orders Metric{enter}");

    cy.wait("@updateCard");

    cy.log("Verify the new name persisted");
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

    cy.log("Verify the change persisted after a reload");
    cy.reload();
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Updated Orders Metric")
      .should("be.visible");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Caching").click();
    H.modal()
      .findByTestId("cache-strategy-select")
      .should("have.value", "Duration");
  });

  it("should duplicate, move, archive and restore a metric via the more menu", () => {
    visitMetricPage();

    cy.log("Verify metric is loaded");
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");

    cy.log("Duplicate the metric into the Metrics collection");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Duplicate").click();
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

    cy.log("Move the original metric to First collection");
    visitMetricPage();
    H.DataStudio.Metrics.aboutPage()
      .findByDisplayValue("Trusted Orders Metric")
      .should("be.visible");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move").click();
    H.pickEntity({ path: ["Our analytics", "First collection"], select: true });

    cy.wait("@updateCard");
    cy.findByTestId("move-card-toast").should("contain", "First collection");

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

    cy.log("Archive the metric");
    H.DataStudio.Metrics.moreMenu().click();
    H.popover().findByText("Move to trash").click();
    H.modal().button("Move to trash").click();

    cy.wait("@updateCard");

    cy.log("Verify the metric is archived");
    cy.findByTestId("archive-banner").should("be.visible");
    cy.get<number>("@trustedMetricId").then((id) =>
      cy
        .request("GET", `/api/card/${id}`)
        .its("body.archived")
        .should("eq", true),
    );

    cy.log("Verify metric appears in trash");
    cy.visit("/trash");
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
