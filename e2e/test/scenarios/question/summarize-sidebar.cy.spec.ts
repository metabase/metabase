const { H } = cy;

const QUESTION_NAME = "Subtotal by total and weekday";
const SUM_COLOR = "#88BF4D";
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

describe("scenarios > question > summarize sidebar > building a summary", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("adds values and groupings, shows them on the chart, keeps them across a reload and saves them", () => {
    H.openOrdersTable();
    // `openOrdersTable` has its own "dataset" alias; a second one would hand out each request twice
    cy.intercept("POST", "/api/dataset").as("summaryQuery");
    H.summarize();

    cy.log("empty state");
    H.assertSummaryWellItems("values", []);
    H.assertSummaryWellItems("columns", []);
    cy.button("Clear all").should("be.disabled");

    cy.log("a column as a value");
    H.addSummaryValue("Subtotal");
    cy.wait("@summaryQuery").then(({ request, response }) => {
      expect(request.body.stages[0].aggregation[0][0]).to.eq("sum");
      expect(response?.body.data.rows).to.have.length(1);
    });
    H.assertSummaryWellItems("values", ["Sum of Subtotal"]);
    cy.findByTestId("scalar-value").should("be.visible");
    H.tableInteractive().should("not.exist");

    cy.log("a number column as a grouping");
    H.clickSummaryField("Total", { section: "Orders" });
    cy.wait("@summaryQuery").then(({ request, response }) => {
      expect(request.body.stages[0].breakout[0][1].binning).to.include({
        strategy: "default",
      });
      expect(response?.body.data.rows).to.have.length.greaterThan(1);
    });
    H.assertSummaryWellItems("columns", ["Total: Auto binned"]);
    H.queryBuilderHeader()
      .findByText("Sum of Subtotal by Total: Auto binned")
      .should("be.visible");
    H.echartsContainer().within(() => {
      cy.findByText("Sum of Subtotal").should("be.visible");
      // the axis names the bin count that Auto binned resolved to
      cy.findByText(/^Total: \d+ bins$/).should("be.visible");
    });
    H.chartPathWithFillColor(SUM_COLOR).should("have.length.greaterThan", 1);

    cy.log("a date column as a second grouping");
    H.clickSummaryField("Created At", { section: "Orders", add: true });
    cy.wait("@summaryQuery").then(({ request }) => {
      const [total, createdAt] = request.body.stages[0].breakout;
      expect(total[1].binning).to.include({ strategy: "default" });
      expect(createdAt[1]["temporal-unit"]).to.eq("month");
    });
    H.assertSummaryWellItems("columns", [
      "Total: Auto binned",
      "Created At: Month",
    ]);

    cy.log("number bins");
    H.changeSummaryGroupingBucket("Total: Auto binned", "10 bins");
    cy.wait("@summaryQuery")
      .its("request.body.stages.0.breakout.0.1.binning")
      .should("include", { strategy: "num-bins", "num-bins": 10 });
    H.assertSummaryWellItems("columns", [
      "Total: 10 bins",
      "Created At: Month",
    ]);

    cy.log("date unit");
    H.openSummaryGroupingMenu("Created At: Month");
    H.menu().within(() => {
      cy.findByRole("menuitem", { name: "Day of week" }).should("not.exist");
      cy.findByRole("menuitem", { name: "More…" }).click();
      cy.findByRole("menuitem", { name: "Day of week" }).click();
    });
    cy.wait("@summaryQuery")
      .its("request.body.stages.0.breakout.1.1.temporal-unit")
      .should("eq", "day-of-week");
    assertSummary();
    H.queryBuilderHeader()
      .findByText(
        "Sum of Subtotal by Total: 10 bins and Created At: Day of week",
      )
      .should("be.visible");
    assertChart();

    cy.log("the summary lives in the URL, so a reload keeps it");
    cy.location("pathname").should("eq", "/question");
    cy.location("hash").should("not.be.empty");
    cy.reload();
    cy.wait("@summaryQuery");
    assertChart();
    H.summarize();
    assertSummary();
    assertBucketsInUse();

    cy.log("save");
    H.summarize();
    H.summarySidebar().should("not.exist");
    H.saveQuestionToCollection(QUESTION_NAME);
    cy.location("pathname").should("match", /^\/question\/\d+-/);
    H.queryBuilderHeader()
      .findByDisplayValue(QUESTION_NAME)
      .should("be.visible");
    assertChart();

    cy.log("the saved question opens with the same summary, unchanged");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.reload();
    cy.wait("@cardQuery");
    assertChart();
    H.summarize();
    assertSummary();
    assertBucketsInUse();
    H.queryBuilderHeader().button("Save").should("not.exist");
  });
});

describe("scenarios > question > summarize sidebar > values made in the notebook", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows custom expressions as chips and keeps them through an edit, a reload and back in the notebook", () => {
    const formulaChips = ["Average order", "Big orders"];

    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    addNotebookFormula({
      formula: "Sum([Total]) / Count()",
      name: "Average order",
    });
    addNotebookFormula({
      formula: "CountIf([Total] > 100)",
      name: "Big orders",
    });
    H.addSummaryGroupingField({ field: "Created At" });
    cy.intercept("POST", "/api/dataset").as("summaryQuery");
    H.visualize();
    waitForQueriedValues().as("notebookValues");

    H.summarize();
    H.assertSummaryWellItems("values", formulaChips);
    H.assertSummaryWellItems("columns", ["Created At: Month"]);

    cy.log("an edit next to them");
    H.changeSummaryGroupingBucket("Created At: Month", "Year");
    cy.wait("@summaryQuery").then(({ request, response }) => {
      cy.get("@notebookValues").should(
        "deep.equal",
        withoutClauseIds(request.body.stages[0].aggregation),
      );
      expect(response?.body.error).to.eq(undefined);
      expect(
        response?.body.data.cols.map(
          (col: { display_name: string }) => col.display_name,
        ),
      ).to.deep.equal(["Created At: Year", ...formulaChips]);
    });
    H.assertSummaryWellItems("values", formulaChips);
    H.assertSummaryWellItems("columns", ["Created At: Year"]);

    cy.log("a reload keeps them");
    cy.reload();
    waitForQueriedValues().then((values) => {
      cy.get("@notebookValues").should("deep.equal", values);
    });
    H.summarize();
    H.assertSummaryWellItems("values", formulaChips);
    H.assertSummaryWellItems("columns", ["Created At: Year"]);

    cy.log("the notebook still has the formulas");
    H.summarize();
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByText("Big orders")
      .should("be.visible");
    H.getNotebookStep("summarize").findByText("Average order").click();
    H.CustomExpressionEditor.value().should("eq", "Sum([Total]) / Count()");
    H.CustomExpressionEditor.nameInput().should("have.value", "Average order");
  });
});

describe("scenarios > question > summarize sidebar > sidebar and notebook", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("carries a summary from the sidebar to the notebook and back, and keeps it across a reload", () => {
    const values = ["Sum of Subtotal", "Count"];
    const groupings = ["Created At: Year", "Product → Category"];

    H.openOrdersTable();
    cy.intercept("POST", "/api/dataset").as("summaryQuery");
    H.summarize();
    H.addSummaryValue("Subtotal");
    cy.wait("@summaryQuery");
    H.clickSummaryField("Created At", { section: "Orders" });
    cy.wait("@summaryQuery");
    H.changeSummaryGroupingBucket("Created At: Month", "Year");
    cy.wait("@summaryQuery");
    H.summarize();
    H.summarySidebar().should("not.exist");

    cy.log("the notebook shows what the sidebar made");
    H.openNotebook();
    assertNotebookSummary({
      values: ["Sum of Subtotal"],
      groupings: ["Created At: Year"],
    });

    cy.log("the sidebar shows what the notebook adds");
    H.addSummaryField({ metric: "Count of rows" });
    H.addSummaryGroupingField({ table: "Product", field: "Category" });
    H.visualize();
    cy.wait("@summaryQuery");
    H.summarize();
    H.assertSummaryWellItems("values", values);
    H.assertSummaryWellItems("columns", groupings);

    cy.log("a reload keeps it in both");
    cy.reload();
    cy.wait("@summaryQuery").then(({ response }) => {
      expect(response?.body.error).to.eq(undefined);
    });
    H.summarize();
    H.assertSummaryWellItems("values", values);
    H.assertSummaryWellItems("columns", groupings);
    H.summarize();
    H.summarySidebar().should("not.exist");
    H.openNotebook();
    assertNotebookSummary({ values, groupings });
  });
});

function assertNotebookSummary({
  values,
  groupings,
}: {
  values: string[];
  groupings: string[];
}) {
  H.getNotebookStep("summarize").within(() => {
    values.forEach((name) => {
      cy.findByTestId("aggregate-step").findByText(name).should("be.visible");
    });
    groupings.forEach((name) => {
      cy.findByTestId("breakout-step").findByText(name).should("be.visible");
    });
  });
}

function addNotebookFormula({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  H.addSummaryField({ metric: "Custom Expression" });
  H.enterCustomColumnDetails({ formula, name, clickDone: true });
}

function withoutClauseIds(clauses: unknown): unknown {
  return JSON.parse(
    JSON.stringify(clauses, (key, value) =>
      key === "lib/uuid" ? undefined : value,
    ),
  );
}

function waitForQueriedValues() {
  return cy
    .wait("@summaryQuery")
    .then(({ request }) =>
      withoutClauseIds(request.body.stages[0].aggregation),
    );
}

function assertSummary() {
  H.assertSummaryWellItems("values", ["Sum of Subtotal"]);
  H.assertSummaryWellItems("columns", [
    "Total: 10 bins",
    "Created At: Day of week",
  ]);
}

function assertChart() {
  H.echartsContainer().within(() => {
    cy.findByText("Sum of Subtotal").should("be.visible");
    cy.findByText("Total: 10 bins").should("be.visible");
  });
  H.chartLegendItems().should(($items) => {
    expect($items.toArray().map((item) => item.textContent)).to.deep.equal(
      WEEKDAYS,
    );
  });
}

function assertBucketsInUse() {
  H.openSummaryGroupingMenu("Total: 10 bins");
  H.menu()
    .findByRole("menuitem", { name: "10 bins" })
    .icon("check")
    .should("be.visible");
  cy.realPress("Escape");
  H.menu().should("not.exist");

  cy.log("a unit from behind More opens the whole list");
  H.openSummaryGroupingMenu("Created At: Day of week");
  H.menu().within(() => {
    cy.findByRole("menuitem", { name: "Day of week" })
      .icon("check")
      .should("be.visible");
    cy.findByRole("menuitem", { name: "More…" }).should("not.exist");
  });
  cy.realPress("Escape");
  H.menu().should("not.exist");
}
