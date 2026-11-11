const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.summarize();
  });

  it("groups by a clicked column, keeps the chip after reopening, and clears back to an empty summary", () => {
    H.summaryWell("columns")
      .findAllByTestId("summary-well-item")
      .should("have.length", 0);

    H.clickSummaryField("Total", { section: "Orders" });
    cy.wait("@dataset");
    H.summaryWellItem("columns", "Total").should("be.visible");

    reopenSummarize();

    // the chip is read back from the query, with the table alias of another table left out
    H.summaryWellItem("columns", "Total").should("not.contain", "Orders →");

    H.removeSummaryItem("Total: Auto binned");
    cy.wait("@dataset");
    H.summaryWell("columns")
      .findAllByTestId("summary-well-item")
      .should("have.length", 0);

    H.clickSummaryField("State", { section: "User" });
    cy.wait("@dataset");

    reopenSummarize();

    H.summaryWellItem("columns", "User → State").should("be.visible");

    H.removeSummaryItem("User → State");
    cy.wait("@dataset");
    H.summaryWell("columns").should("not.contain", "User → State");

    H.removeSummaryItem("Count");
    cy.wait("@dataset");
    H.summaryWell("values")
      .findAllByTestId("summary-well-item")
      .should("have.length", 0);
    H.summaryWell("values")
      .findByPlaceholderText("Type a metric or column")
      .should("be.visible");
    cy.button("Clear all").should("be.disabled");
  });

  it("changes the date unit and the bins of groupings from their chips and keeps them across a reload", () => {
    H.clickSummaryField("Created At", { section: "Orders" });
    cy.wait("@dataset");
    H.clickSummaryField("Total", { section: "Orders", add: true });
    cy.wait("@dataset");
    H.clickSummaryField("Category", { section: "Product", add: true });
    cy.wait("@dataset");
    H.assertSummaryWellItems("columns", [
      "Created At: Month",
      "Total: Auto binned",
      "Product → Category",
    ]);

    cy.log("a grouping without units or bins has no menu");
    H.summaryWellItem("columns", "Product → Category")
      .findByRole("button", { name: /Change how/ })
      .should("not.exist");

    cy.log("the options shown up front");
    H.changeSummaryGroupingBucket("Created At: Month", "Quarter");
    cy.wait("@dataset")
      .its("request.body.stages.0.breakout.0.1.temporal-unit")
      .should("eq", "quarter");
    H.changeSummaryGroupingBucket("Total: Auto binned", "50 bins");
    cy.wait("@dataset")
      .its("request.body.stages.0.breakout.1.1.binning")
      .should("include", { strategy: "num-bins", "num-bins": 50 });
    H.assertSummaryWellItems("columns", [
      "Created At: Quarter",
      "Total: 50 bins",
      "Product → Category",
    ]);

    cy.log("the less common units and Don't bin sit behind More");
    H.openSummaryGroupingMenu("Created At: Quarter");
    H.menu().within(() => {
      cy.findByRole("menuitem", { name: "Quarter" })
        .icon("check")
        .should("be.visible");
      cy.findByRole("menuitem", { name: "Don't bin" }).should("not.exist");
      cy.findByRole("menuitem", { name: "More…" }).click();
      cy.findByRole("menuitem", { name: "Day of week" }).should("be.visible");
      cy.findByRole("menuitem", { name: "Don't bin" }).click();
    });
    cy.wait("@dataset");
    H.assertSummaryWellItems("columns", [
      "Created At",
      "Total: 50 bins",
      "Product → Category",
    ]);

    cy.log("the choices live in the URL, so a reload keeps them");
    cy.reload();
    cy.wait("@dataset");
    H.summarize();
    H.assertSummaryWellItems("columns", [
      "Created At",
      "Total: 50 bins",
      "Product → Category",
    ]);
    H.openSummaryGroupingMenu("Total: 50 bins");
    H.menu()
      .findByRole("menuitem", { name: "50 bins" })
      .icon("check")
      .should("be.visible");
  });

  it("should only scroll the field list in the summarize sidebar and not show the run button overlay when an error occurs (metabase#45452, metabase#12586)", () => {
    cy.findByTestId("summary-panel").then(($el) => {
      const element = $el[0];
      expectNoScrollbar(element);
    });

    cy.findByTestId("summary-wells").then(($el) => {
      const element = $el[0];
      expectNoScrollbar(element);
    });

    // the field list is the only element with a scrollbar
    cy.findByTestId("summary-field-list-scroll").then(($el) => {
      const element = $el[0];
      expect(element.scrollHeight > element.clientHeight).to.be.true;
      expect(element.offsetWidth > element.clientWidth).to.be.true;
    });

    cy.intercept("POST", "/api/dataset", (req) => req.destroy());

    H.addSummaryValue("Count of rows");
    H.main()
      .findByText("We're experiencing server issues")
      .should("be.visible");
    cy.findByTestId("query-builder-main").icon("play").should("not.be.visible");
  });
});

describe("scenarios > question > summarize", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Number of distinct values of ...").click();
      cy.findByLabelText("Temporal bucket").realHover().click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover()
      .last()
      .within(() => {
        cy.button("More…").click();
        cy.findByText("Hour of day").click();
      });

    H.getNotebookStep("summarize")
      .findByText("Distinct values of Created At: Hour of day")
      .should("be.visible");
  });

  it("summarizes the results of a SQL question, with a date unit and a cut-off column name shown in full", () => {
    const longColumnName =
      "Customer state of residence at the time of their signup";

    H.createNativeQuestion(
      {
        name: "SQL orders",
        native: {
          query: `SELECT o.CREATED_AT AS CREATED_AT, o.TOTAL AS TOTAL, pe.STATE AS "${longColumnName}" FROM ORDERS o JOIN PEOPLE pe ON pe.ID = o.USER_ID`,
        },
      },
      { visitQuestion: true },
    );
    cy.findByTestId("qb-header-action-panel")
      .findByText("Explore results")
      .click();
    cy.wait("@dataset");
    H.summarize();

    H.addSummaryValue("TOTAL");
    cy.wait("@dataset");
    H.clickSummaryField("CREATED_AT");
    cy.wait("@dataset");
    H.clickSummaryField(longColumnName, { add: true });
    cy.wait("@dataset");
    H.summaryWellItem("values", "Sum of TOTAL").should("be.visible");
    H.assertSummaryWellItems("columns", ["CREATED_AT: Month", longColumnName]);

    H.changeSummaryGroupingBucket("CREATED_AT: Month", "Year");
    cy.wait("@dataset").then(({ request, response }) => {
      expect(request.body.stages[0].breakout[0][1]["temporal-unit"]).to.eq(
        "year",
      );
      expect(response.body.data.cols.map((col) => col.display_name)).to.eql([
        "CREATED_AT: Year",
        longColumnName,
        "Sum of TOTAL",
      ]);
    });
    H.assertSummaryWellItems("columns", ["CREATED_AT: Year", longColumnName]);

    cy.log("a name too long for its chip or its row shows in full on hover");
    H.summaryWellItem("columns", longColumnName)
      .findByText(longColumnName)
      .realHover();
    H.tooltip().should("have.text", longColumnName);

    H.summaryWellItem("values", "Sum of TOTAL").realHover();
    H.tooltip().should("not.exist");

    H.summaryField(longColumnName).findByText(longColumnName).realHover();
    H.tooltip().should("have.text", longColumnName);
  });

  it("should handle (removing) multiple metrics when one is sorted (metabase#12625)", () => {
    H.createTestQuery({
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "SUBTOTAL" }],
            },
            {
              type: "operator",
              operator: "sum",
              name: "sum_2",
              args: [{ type: "column", name: "TOTAL" }],
            },
          ],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              unit: "year",
            },
          ],
          orderBys: [
            {
              direction: "desc",
              type: "column",
              name: "sum",
            },
          ],
        },
      ],
    })
      .then((dataset_query) => H.createCard({ name: "12625", dataset_query }))
      .then((card) => H.visitQuestion(card.id));

    H.summarize();

    cy.findAllByTestId("header-cell").should("have.length", 4);
    H.tableHeaderColumn("Sum of Subtotal")
      .closest("[data-testid=header-cell]")
      .findByLabelText("chevrondown icon");

    cy.log('At this point only "Sum of Subtotal" should be sorted');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 1);

    cy.log("Remove the sorted metric");
    removeMetricFromSidebar("Sum of Subtotal");

    cy.log('"Sum of Total" should not be sorted, nor any other header cell');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 0);

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("not.contain", "Sum of Subtotal");

    removeMetricFromSidebar("Sum of Total");

    cy.findAllByTestId("header-cell").should("have.length", 2);
    cy.get("[data-testid=cell-data]").should("contain", 744); // `Count` for year 2025
  });
});

function removeMetricFromSidebar(metricName) {
  H.interceptIfNotPreviouslyDefined({
    method: "POST",
    url: "/api/dataset",
    alias: "dataset",
  });

  H.removeSummaryItem(metricName);
  cy.wait("@dataset");

  H.summaryWellItem("values", metricName).should("not.exist");
}

function reopenSummarize() {
  H.summarize();
  H.summaryWell("values").should("not.exist");
  H.summarize();
}

function expectNoScrollbar(element) {
  const { borderLeftWidth, borderRightWidth } = getComputedStyle(element);
  const scrollbarWidth =
    element.offsetWidth -
    element.clientWidth -
    parseFloat(borderLeftWidth) -
    parseFloat(borderRightWidth);

  expect(scrollbarWidth).to.equal(0);
}
