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
      cy.log(
        "Only renders the notebook editor (with the summarize button that has the metrics' name on it) after the metadata is loaded",
      );

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
