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

      cy.wait("@metadata");

      cy.findByText("Loading...").should("not.exist");
      H.getNotebookStep("summarize").should("be.visible");

      H.getNotebookStep("summarize")
        .findByText("Metric 47058")
        .should("be.visible");
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
    H.createQuestion(METRIC_B, { wrapId: true, idAlias: "metricBId" });
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
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@metricBId").then((metricBId) => {
      cy.visit(`/metric/${metricBId}/query`);
    });
    H.MetricPage.queryEditor().should("be.visible");

    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.runButtonInOverlay().click();
    cy.wait("@dataset");
    H.MetricPage.saveButton().click();
    cy.wait("@saveCard");

    cy.get<number>("@dashboardId").then((id) => {
      H.visitDashboard(id);
    });

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

describe("issue 79571", () => {
  const METRIC_NAME = "Metric 79571";

  const ORDERS_COUNT_METRIC: StructuredQuestionDetails = {
    name: METRIC_NAME,
    type: "metric",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("logs choosing a metric as a recent selection, offers custom column and join actions on it, and lists it under Recent items (metabase#79571)", () => {
    H.createQuestion(ORDERS_COUNT_METRIC).then(({ body: { id: metricId } }) => {
      cy.intercept("POST", "/api/activity/recents").as("logRecent");

      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(METRIC_NAME).click();
      });

      cy.wait("@logRecent").then(({ request, response }) => {
        expect(request.body).to.deep.equal({
          model: "metric",
          model_id: metricId,
          context: "selection",
        });
        expect(response?.statusCode).to.eq(204);
      });

      H.getNotebookStep("data").within(() => {
        cy.findByTestId("action-buttons")
          .button("Custom column")
          .should("be.visible");
        cy.findByTestId("action-buttons")
          .button("Join data")
          .should("be.visible");
      });

      // Reopening the picker now surfaces the metric under Recent items
      H.getNotebookStep("data").findByText("Orders").click();
      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModalItem(0, "Recent items").click();
      cy.findByRole("dialog", { name: "Pick your starting data" })
        .findByText(METRIC_NAME)
        .should("exist");
    });
  });
});
