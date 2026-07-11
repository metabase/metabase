const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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

      cy.findByText("Loading...").should("not.exist");
      H.getNotebookStep("summarize").should("be.visible");

      cy.findByText("[Unknown Metric]").should("not.exist");
    });
  });
});

describe("issue 32037", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
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
      },
      { wrapId: true, idAlias: "metricId" },
    );
  });

  it("should show unsaved changes modal and allow to discard changes when editing a metric (metabase#32037)", () => {
    cy.get<number>("@metricId").then((metricId) => {
      cy.visit(`/metric/${metricId}/query`);
    });
    H.MetricPage.queryEditor().should("be.visible");
    H.MetricPage.saveButton().should("not.exist");

    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });

    H.MetricPage.saveButton().should("be.visible");

    H.MetricPage.aboutTab().click();

    H.modal().within(() => {
      cy.findByText("Discard your changes?").should("be.visible");
      cy.findByText("Discard changes").click();
    });

    H.MetricPage.aboutPage().should("be.visible");
    cy.get<number>("@metricId").then((metricId) => {
      cy.location("pathname").should("eq", `/metric/${metricId}`);
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
    H.MetricPage.queryEditor().should("be.visible");
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });
    H.MetricPage.saveButton().click();
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("M1");
      cy.button("Save").click();
    });
    H.MetricPage.aboutPage().should("be.visible");

    cy.log("create the second metric");
    H.navigationSidebar().findByText("Metrics").click();
    H.main().findByLabelText("Create a new metric").click();
    H.MetricPage.queryEditor().should("be.visible");
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
    H.MetricPage.saveButton().click();
    H.modal().within(() => {
      cy.findByLabelText("Name").clear().type("M2");
      cy.button("Save").click();
    });
    H.MetricPage.aboutPage().should("be.visible");
  });
});
