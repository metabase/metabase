const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders count",
  description: "Total number of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const dimensionList = () => cy.findByTestId("metric-dimension-list");
const dimensionRow = (name: string) =>
  dimensionList().findByTestId(`dimension-row-${name}`);
const addDimensionsPanel = () => cy.findByTestId("add-dimensions-panel");
const settingsPanel = () => cy.findByTestId("dimension-settings-panel");

describe("scenarios > metrics > metric page", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should chart the seeded dimensions, save a definition change, bookmark, duplicate and move a metric to trash", () => {
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("POST", "/api/card").as("createCard");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      H.visitMetric(metric.id);
    });

    cy.log("the about page previews the metric value");
    H.MetricPage.aboutPage().within(() => {
      cy.findByTestId("visualization-root")
        .should("be.visible")
        .and("have.attr", "data-viz-ui-name", "Number");
      cy.findByTestId("scalar-value").should("have.text", "18,760");
    });

    cy.log(
      "the overview charts the seeded dimensions and loads more on scroll",
    );
    H.MetricPage.overviewTab().click();
    H.MetricPage.overviewPage().within(() => {
      cy.findAllByText(/^By /).then(($cards) => {
        expect($cards.map((_, card) => card.textContent).get()).to.deep.equal([
          "By Subtotal",
          "By Tax",
          "By Total",
          "By Discount",
        ]);
      });
    });
    H.MetricPage.overviewPage().realMouseWheel({ deltaY: 100 });
    H.MetricPage.overviewPage().findAllByText(/^By /).should("have.length", 6);

    cy.log("save a definition change");
    H.MetricPage.definitionTab().click();
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.MetricPage.saveButton().click();
    cy.wait("@updateCard");
    H.undoToast().should("contain.text", "Metric query updated");

    cy.reload();
    H.MetricPage.queryEditor().should("be.visible");
    H.getNotebookStep("summarize")
      .findByText("Sum of Total")
      .should("be.visible");

    cy.log("the change is recorded in the history");
    H.MetricPage.historyTab().click();
    cy.findAllByTestId("revision-history-event").should("have.length.gte", 2);

    cy.log("bookmark via more menu");
    H.MetricPage.aboutTab().click();
    H.MetricPage.moreMenu().click();
    H.popover().findByTextEnsureVisible("Bookmark").click();
    H.navigationSidebar().findByText("Orders count").should("be.visible");

    cy.log("duplicate via more menu");
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Duplicate").click();
    H.modal().within(() => {
      cy.findByLabelText("Name")
        .should("have.value", "Orders count - Duplicate")
        .clear()
        .type("Orders count copy");
      cy.button("Duplicate").click();
    });
    cy.wait("@createCard").then(({ response }) => {
      cy.location("pathname").should("eq", `/metric/${response?.body.id}`);
    });
    H.MetricPage.aboutPage()
      .findByDisplayValue("Orders count copy")
      .should("be.visible");

    cy.log("move to trash via more menu");
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Move to trash").click();
    H.modal().button("Move to trash").click();
    cy.wait("@updateCard");
    H.main().findByText("This metric is in the trash.");
  });

  it(
    "should create an alert with webhook and show Edit alerts after",
    { tags: ["@external"] },
    () => {
      H.setupNotificationChannel({
        name: "Foo Hook",
        description: "This is a hook",
      });
      H.setupNotificationChannel({
        name: "Bar Hook",
        description: "This is another hook",
      });
      cy.setCookie("metabase.SEEN_ALERT_SPLASH", "true");

      cy.intercept("POST", "/api/notification").as("createAlert");

      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
        H.visitMetric(metric.id);
      });

      H.MetricPage.moreMenu().click();
      H.popover().findByText("Create an alert").click();

      H.addNotificationHandlerChannel("Bar Hook");

      H.selectScheduleTime();
      cy.findByRole("button", { name: "Done" }).click();

      cy.wait("@createAlert").then(({ response }) => {
        expect(response?.body?.payload?.send_condition).to.equal("has_result");
      });

      H.notificationList().findByText("Your alert is all set up.");

      H.MetricPage.moreMenu().click();
      H.popover().findByText("Edit alerts").should("be.visible");
    },
  );

  it("should persist the dimension curation and use the default dimension's time bucket on the About page", () => {
    // Dimension ids are UUIDs, which keeps this from also matching the
    // fixed-word routes below.
    cy.intercept("POST", /\/api\/metric\/\d+\/dimension\/[0-9a-f-]{36}$/).as(
      "updateDimension",
    );
    cy.intercept("POST", "/api/metric/*/dimension/add").as("addDimensions");
    cy.intercept("POST", "/api/metric/*/dimension/set-default").as(
      "setDefaultDimension",
    );
    cy.intercept("GET", "/api/metric/*/dimension*").as("listDimensions");

    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      // Reading a metric seeds its curated dimension list with the metric's
      // own table columns.
      cy.request("GET", `/api/metric/${metric.id}`);
      cy.visit(`/metric/${metric.id}/dimensions`);
    });
    cy.wait("@listDimensions");

    cy.log("add a dimension from a connected table");
    dimensionList()
      .findByRole("button", { name: "Available dimensions" })
      .click();
    addDimensionsPanel().findByText("Category").click();
    cy.wait("@addDimensions");
    dimensionRow("Product - Category").should("exist");
    addDimensionsPanel().findByRole("button", { name: "Done" }).click();

    cy.log("rename and describe it");
    dimensionRow("Product - Category").findByText("Product - Category").click();
    settingsPanel()
      .findByLabelText("Display name")
      .clear()
      .type("Product type")
      .blur();
    cy.wait("@updateDimension");
    settingsPanel()
      .findByLabelText("Description")
      .type("Category of the ordered product")
      .blur();
    cy.wait("@updateDimension");

    cy.log("give Created At weekly buckets and make it the default");
    dimensionRow("Created At").findByText("Created At").click();
    settingsPanel().findByLabelText("Time grouping").click();
    cy.findByRole("option", { name: "Week" }).click();
    cy.wait("@updateDimension");
    settingsPanel().findByRole("button", { name: "Set as default" }).click();
    cy.wait("@setDefaultDimension");

    cy.log("the About page charts the new default dimension by week");
    H.MetricPage.aboutTab().click();
    assertAboutChartsCreatedAtByWeek();

    cy.log("the curation is persisted");
    cy.reload();
    assertAboutChartsCreatedAtByWeek();
    H.MetricPage.dimensionsTab().click();
    cy.wait("@listDimensions");
    dimensionRow("Created At").findByText("Default").should("exist");
    dimensionList().findAllByText("Default").should("have.length", 1);
    dimensionRow("Created At").findByText("Created At").click();
    settingsPanel()
      .findByLabelText("Time grouping")
      .should("have.value", "Week");
    dimensionRow("Product type").findByText("Product type").click();
    settingsPanel()
      .findByLabelText("Description")
      .should("have.value", "Category of the ordered product");
  });
});

function assertAboutChartsCreatedAtByWeek() {
  H.MetricPage.aboutPage()
    .findByRole("button", { name: "Select dimension: Created At: Week" })
    .should("be.visible");
  H.MetricPage.aboutPage()
    .findByTestId("visualization-root")
    .should("be.visible")
    .and("have.attr", "data-viz-ui-name", "Line");
}
