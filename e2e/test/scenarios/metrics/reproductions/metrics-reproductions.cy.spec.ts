import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 47058", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/card/*/query_metadata", req =>
      req.continue(() => new Promise(resolve => setTimeout(resolve, 1000))),
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
  const METRIC_A: H.StructuredQuestionDetails = {
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

  const METRIC_B: H.StructuredQuestionDetails = {
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

    H.openQuestionActions();
    H.popover().findByText("Edit metric definition").click();
    H.getNotebookStep("summarize").button("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    cy.button("Save changes").click();
    cy.get<number>("@dashboardId").then(id => {
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
    H.getDashboardCard(0).findByLabelText("Add series").click();
    H.modal().findByText("Metric 44171-B").should("be.visible");
  });
});
