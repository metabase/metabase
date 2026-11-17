const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("can see x-ray options when a custom column is present (#16680)", () => {
    H.createQuestion(
      {
        name: "16680",
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["expression", "TestColumn"],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          expressions: { TestColumn: ["+", 1, 1] },
        },
      },
      { visitQuestion: true },
    );
    cy.intercept("GET", "/api/automagic-dashboards/**/cell/**/compare/**").as(
      "xray",
    );

    H.cartesianChartCircle().eq(5).click();
    H.popover()
      .findByText(/Automatic Insights/i)
      .click();
    H.popover().findByText(/X-ray/i).should("be.visible");
    H.popover()
      .findByText(/Compare to the rest/i)
      .click();

    cy.wait("@xray").its("response.statusCode").should("eq", 200);
    cy.location("pathname").should("match", /^\/auto\/dashboard\//);
    cy.findAllByTestId("dashcard-container").should("have.length.gt", 0);
  });

  it("should allow to use `if` function", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.log("custom columns");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'if([ID] = 1, "First", [ID] = 2, "Second", "Other")',
      name: "If",
    });
    H.expressionEditorWidget().button("Done").click();
    H.getNotebookStep("expression").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("If").click();
    });
    H.selectFilterOperator("Is");
    H.clauseStepPopover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Other");
      cy.button("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(198);
    H.openNotebook();
    H.getNotebookStep("filter").findByText("If is Other").icon("close").click();
    H.getNotebookStep("expression").findByText("If").icon("close").click();

    cy.log("filters");
    H.getNotebookStep("data").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: 'if([Category] = "Gadget", 1, [Category] = "Widget", 2) = 2',
      });
      cy.button("Done").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(54);
    H.openNotebook();
    H.getNotebookStep("filter")
      .findByText("If is equal to 2")
      .icon("close")
      .click();

    cy.log("aggregations");
    H.getNotebookStep("data").button("Summarize").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: 'sum(if([Category] = "Gadget", 1, 2))',
        name: "SumIf",
      });
      cy.button("Done").click();
    });
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "347");
  });
});
