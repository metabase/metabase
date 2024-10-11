import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type StructuredQuestionDetails,
  createDashboard,
  createQuestion,
  editDashboard,
  getDashboardCard,
  getNotebookStep,
  main,
  modal,
  openQuestionActions,
  popover,
  restore,
  showDashboardCardActions,
  sidebar,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("issue 47058", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/card/*/query_metadata", req =>
      req.continue(() => new Promise(resolve => setTimeout(resolve, 1000))),
    ).as("metadata");

    createQuestion({
      name: "Metric 47058",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    }).then(({ body: { id: metricId } }) => {
      createQuestion({
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
    main().within(() => {
      cy.findByText("Loading...").should("be.visible");
      getNotebookStep("summarize").should("not.exist");

      cy.findByText("[Unknown Metric]").should("not.exist");

      cy.wait("@metadata");
      cy.log(
        "Only renders the notebook editor (with the summarize button that has the metrics' name on it) after the metadata is loaded",
      );

      cy.findByText("Loading...").should("not.exist");
      getNotebookStep("summarize").should("be.visible");

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
    restore();
    cy.signInAsAdmin();

    createQuestion(METRIC_A);
    createQuestion(METRIC_B).then(({ body: { id } }) => {
      cy.visit(`/metric/${id}`);
    });
    createDashboard(
      {
        name: "Dashboard 44171",
        dashcards: [],
      },
      { wrapId: true },
    );
  });

  it("should not save viz settings on metrics", () => {
    openQuestionActions();
    popover().findByText("Edit metric definition").click();
    getNotebookStep("summarize").button("Count").click();
    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    cy.button("Save changes").click();
    cy.get("@dashboardId").then(id => {
      cy.visit(`/dashboard/${id}`);
    });

    editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add questions")
      .click();

    sidebar().findByText("Metric 44171-A").click();

    showDashboardCardActions(0);
    getDashboardCard(0).findByLabelText("Add series").click();
    modal().findByText("Metric 44171-B").should("be.visible");
  });
});
