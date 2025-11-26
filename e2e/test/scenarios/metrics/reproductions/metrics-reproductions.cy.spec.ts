const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 47058", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/card/*/query_metadata", (req) =>
      req.continue(() => new Promise((resolve) => setTimeout(resolve, 1000))),
    ).as("metadata");

    H.createQuestion({
      name: "Metric 47058",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    }).then(({ body: { id: metricId } }) => {
      H.createQuestion({
        name: "Question 47058",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          fields: [
            ["field", ORDERS.ID, {}],
            ["field", ORDERS.TOTAL, {}],
          ],
          aggregation: [["metric", metricId]],
          limit: 1,
        },
      }).then(({ body: { id: questionId } }) => {
        cy.visit(`/question/${questionId}/notebook`);
      });
    });
  });

  it("should show the loading page while the question metadata is being fetched (metabase#47058)", () => {
    H.main().within(() => {
      cy.findByText("Loading...").should("be.visible");
      H.getNotebookStep("summarize").should("not.exist");

      cy.findByText("[Unknown Metric]").should("not.exist");

      cy.wait("@metadata");
      cy.log(
        "Only renders the notebook editor (with the summarize button that has the metrics' name on it) after the metadata is loaded",
      );

      cy.findByText("Loading...").should("not.exist");
      H.getNotebookStep("summarize").should("be.visible");

      cy.findByText("[Unknown Metric]").should("not.exist");
    });
  });
});

describe("issue 44171", () => {
  const METRIC_A: StructuredQuestionDetails = {
    name: "Metric 44171-A",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  const METRIC_B: StructuredQuestionDetails = {
    name: "Metric 44171-B",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(METRIC_A);
    H.createQuestion(METRIC_B, { visitQuestion: true });
    H.createDashboard(
      {
        name: "Dashboard 44171",
        dashcards: [],
      },
      { wrapId: true },
    );
  });

  it("should not save viz settings on metrics", () => {
    cy.intercept("PUT", "/api/card/*").as("saveCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.openQuestionActions();
    H.popover().findByText("Edit metric definition").click();
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    cy.button("Save changes").click();
    cy.get<number>("@dashboardId").then((id) => {
      H.visitDashboard(id);
    });

    cy.get("@saveCard")
      .its("request.body")
      .its("visualization_settings")
      .should("not.exist");

    H.editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add questions")
      .click();

    H.sidebar().findByText("Metric 44171-A").click();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset("Metric 44171-B");
      H.chartLegendItem("Metric 44171-A").should("exist");
      H.chartLegendItem("Metric 44171-B").should("exist");
    });
  });
});

describe("issue 32037", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion({
      name: "Metric 32037",
      type: "metric",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "temporal-unit": "month", "base-type": "type/DateTime" },
          ],
        ],
      },
    });
  });

  it("should show unsaved changes modal and allow to discard changes when editing a metric (metabase#32037)", () => {
    cy.visit("/browse/metrics");
    cy.findByLabelText("Metric 32037").click();
    H.cartesianChartCircle().should("be.visible");
    cy.location("pathname").as("metricPathname");
    H.openQuestionActions("Edit metric definition");
    cy.button("Save changes").should("be.disabled");
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Total").click();
      cy.findByPlaceholderText("Min").type("0");
      cy.findByPlaceholderText("Max").type("100");
      cy.button("Add filter").click();
    });
    cy.button("Save changes").should("be.enabled");
    cy.go("back");

    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.findByText("Discard changes").click();
    });

    H.appBar().should("be.visible");
    cy.button("Save changes").should("not.exist");
    cy.get("@metricPathname").then((metricPathname) => {
      cy.location("pathname").should("eq", metricPathname);
    });
  });
});

describe("issue 30574", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not throw when diving a metric by another metric with a custom aggregation expression with a custom name (metabase#30574)", () => {
    cy.visit("/browse/metrics");

    cy.log("create the first metric");
    H.main().findByText("Create metric").click();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    cy.findByTestId("edit-bar").button("Save").click();
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("M1");
      cy.button("Save").click();
    });
    H.queryBuilderHeader().should("be.visible");

    cy.log("create the second metric");
    H.openNavigationSidebar();
    H.navigationSidebar().findByText("Metrics").click();
    H.main().findByLabelText("Create a new metric").click();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      name: "X",
      formula: "[M1]/[M1]",
    });
    H.popover().button("Update").click();
    cy.findByTestId("edit-bar").button("Save").click();
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("M2");
      cy.button("Save").click();
    });
    H.queryBuilderHeader().should("be.visible");
    H.assertQueryBuilderRowCount(1);
  });
});
