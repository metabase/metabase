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

    cy.log("a column dragged onto Summarize by");
    H.dragSummaryFieldToWell("Subtotal", "values", { section: "Orders" });
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
    cy.wait("@summaryQuery").then(({ request, response }) => {
      expect(request.body.stages[0].breakout[0][1].binning).to.include({
        strategy: "num-bins",
        "num-bins": 10,
      });
      const rows: [number, ...unknown[]][] = response?.body.data.rows ?? [];
      const totalBins = new Set(rows.map(([total]) => total));
      expect(totalBins.size).to.be.within(2, 10);
    });
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

describe("scenarios > question > summarize sidebar > pivot rows", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("renames a formula chip in Rows, shows the new name in the pivot table and keeps it across a reload", () => {
    const formulaName = "year(Created At)";
    const newName = "Order year";

    H.openOrdersTable();
    cy.intercept("POST", "/api/dataset/pivot").as("pivotQuery");
    H.summarize();
    H.addSummaryValue("Subtotal");
    cy.button("Pivot into rows and columns").click();
    H.summaryWell("rows").findByLabelText("Add a row by name").type("=");
    H.codeMirrorHelpers("formula-editor", {}).type("year([Created At])");
    cy.findByTestId("formula-editor").button("Add").click();
    cy.wait("@pivotQuery");
    H.assertSummaryWellItems("rows", [formulaName]);
    cy.findByTestId("pivot-table").findByText(formulaName).should("be.visible");

    cy.log("rename");
    H.summaryWellItem("rows", formulaName).findByText(formulaName).dblclick();
    H.summarySidebar()
      .findByLabelText(`Rename ${formulaName}`)
      .clear()
      .type(`${newName}{enter}`);
    cy.wait("@pivotQuery").then(({ response }) => {
      expect(response?.body.error).to.eq(undefined);
    });
    H.assertSummaryWellItems("rows", [newName]);
    H.assertSummaryWellItems("columns", []);
    H.assertSummaryWellItems("values", ["Sum of Subtotal"]);
    cy.findByTestId("pivot-table").within(() => {
      cy.findByText(newName).should("be.visible");
      cy.findByText(formulaName).should("not.exist");
    });

    cy.log("a reload keeps the name and the chip in Rows");
    cy.reload();
    cy.wait("@pivotQuery");
    cy.findByTestId("pivot-table").findByText(newName).should("be.visible");
    H.summarize();
    H.assertSummaryWellItems("rows", [newName]);
    H.assertSummaryWellItems("columns", []);
    H.assertSummaryWellItems("values", ["Sum of Subtotal"]);
  });
});

describe("scenarios > question > summarize sidebar > pivot and other visualizations", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("moves the Rows groupings to Group by under another visualization, back to Rows with the pivot table, and keeps them across a reload", () => {
    H.openOrdersTable();
    cy.intercept("POST", "/api/dataset").as("summaryQuery");
    cy.intercept("POST", "/api/dataset/pivot").as("pivotQuery");
    H.summarize();
    H.addSummaryValue("Subtotal");
    cy.wait("@summaryQuery");
    cy.button("Pivot into rows and columns").click();
    H.addSummaryRow("Category");
    cy.wait("@pivotQuery");
    H.clickSummaryField("Created At", { section: "Orders" });
    cy.wait("@pivotQuery");
    assertPivotWells();
    cy.findByTestId("pivot-table").should("be.visible");

    cy.log("another visualization");
    showVisualization("Table");
    cy.wait("@summaryQuery");
    H.tableInteractive().should("be.visible");
    H.summarize();
    H.summaryWell("rows").should("not.exist");
    H.assertSummaryWellItems("columns", [
      "Product → Category",
      "Created At: Month",
    ]);
    H.assertSummaryWellItems("values", ["Sum of Subtotal"]);

    cy.log("the pivot table again");
    showVisualization("Pivot Table");
    cy.wait("@pivotQuery");
    cy.findByTestId("pivot-table").should("be.visible");
    H.summarize();
    assertPivotWells();

    cy.log("a reload keeps the wells");
    cy.reload();
    cy.wait("@pivotQuery");
    cy.findByTestId("pivot-table").should("be.visible");
    H.summarize();
    assertPivotWells();
  });
});

function assertPivotWells() {
  H.assertSummaryWellItems("rows", ["Product → Category"]);
  H.assertSummaryWellItems("columns", ["Created At: Month"]);
  H.assertSummaryWellItems("values", ["Sum of Subtotal"]);
}

function showVisualization(name: "Table" | "Pivot Table") {
  H.summarize();
  H.summarySidebar().should("not.exist");
  H.openVizTypeSidebar();
  H.vizTypeSidebar().findByTestId(`${name}-button`).click();
  H.vizTypeSidebar().button("Done").click();
}

describe("scenarios > question > summarize sidebar > formulas", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("keeps formulas from the table and from the wells, one renamed and one edited from its chip, across a save and a reload", () => {
    const tableColumn = "Total * 2";
    const valueFormula = "Sum([Total * 2]) / Count()";
    const valueFormulaName = "Sum(Total * 2) / Count()";
    const valueName = "Average double";
    const groupingFormula = "month([Created At])";
    const groupingName = "month(Created At)";
    const assertFormulaWells = () => {
      H.assertSummaryWellItems("values", [valueName]);
      H.assertSummaryWellItems("columns", [groupingName]);
    };

    H.openOrdersTable();
    cy.intercept("POST", "/api/dataset").as("summaryQuery");

    cy.log("a custom column from the table");
    cy.button("Add column").click();
    formulaEditor().type("[Total] * 2");
    cy.findByTestId("formula-editor").button("Add column").click();
    cy.wait("@summaryQuery")
      .its("response.body.data.cols")
      .should((cols: { display_name: string }[]) => {
        expect(cols.map((col) => col.display_name)).to.include(tableColumn);
      });

    cy.log("a formula in Summarize by");
    H.summarize();
    H.summaryWell("values").findByLabelText("Add a value by name").type("=");
    formulaEditor().type(valueFormula);
    cy.findByTestId("formula-editor").button("Add").click();
    cy.wait("@summaryQuery");
    H.assertSummaryWellItems("values", [valueFormulaName]);

    cy.log("a formula in Group by");
    H.summaryWell("columns")
      .findByLabelText("Add a grouping by name")
      .type("=");
    formulaEditor().type("year([Created At])");
    cy.findByTestId("formula-editor").button("Add").click();
    cy.wait("@summaryQuery");
    H.assertSummaryWellItems("columns", ["year(Created At)"]);

    cy.log("the value renamed from its chip");
    H.summaryWellItem("values", valueFormulaName)
      .findByText(valueFormulaName)
      .dblclick();
    H.summarySidebar()
      .findByLabelText(`Rename ${valueFormulaName}`)
      .clear()
      .type(`${valueName}{enter}`);
    cy.wait("@summaryQuery");
    H.assertSummaryWellItems("values", [valueName]);

    cy.log("the grouping edited from its chip");
    formulaChip("year(Created At)").click();
    formulaEditor().value().should("eq", "year([Created At])");
    formulaEditor().clear().type(groupingFormula);
    cy.findByTestId("formula-editor").button("Update").click();
    cy.wait("@summaryQuery").then(({ response }) => {
      expect(response?.body.error).to.eq(undefined);
      const result = getResult(response?.body);
      expect(result.cols).to.deep.equal([groupingName, valueName]);
      expect(result.rows).to.have.length(12);
      cy.wrap(result).as("result");
    });
    cy.findByTestId("formula-editor").should("not.exist");
    assertFormulaWells();

    cy.log("save");
    H.summarize();
    H.summarySidebar().should("not.exist");
    H.saveQuestionToCollection("Formulas round trip");
    cy.location("pathname").should("match", /^\/question\/\d+-/);

    cy.log("the saved question opens with the same results and wells");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.reload();
    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.body.error).to.eq(undefined);
      cy.get("@result").should("deep.equal", getResult(response?.body));
    });
    H.queryBuilderHeader().button("Save").should("not.exist");
    H.summarize();
    assertFormulaWells();

    cy.log("the chips still open their formulas");
    formulaChip(groupingName).click();
    formulaEditor().value().should("eq", groupingFormula);
    cy.realPress("Escape");
    cy.findByTestId("formula-editor").should("not.exist");
    formulaChip(valueName).click();
    formulaEditor().value().should("eq", valueFormula);
    cy.realPress("Escape");
    cy.findByTestId("formula-editor").should("not.exist");

    cy.log("the notebook has the table's column and the grouping's one");
    H.summarize();
    H.summarySidebar().should("not.exist");
    H.openNotebook();
    H.getNotebookStep("expression").within(() => {
      cy.findByText(tableColumn).should("be.visible");
      cy.findByText(groupingName).should("be.visible");
    });
  });
});

function formulaEditor() {
  return H.codeMirrorHelpers("formula-editor", {});
}

function formulaChip(name: string) {
  return H.summarySidebar().findByRole("button", {
    name: `Edit the formula of ${name}`,
  });
}

function getResult(body: {
  data: { cols: { display_name: string }[]; rows: unknown[][] };
}) {
  return {
    cols: body.data.cols.map((col) => col.display_name),
    rows: body.data.rows,
  };
}

describe("scenarios > question > summarize sidebar > pivot round trip", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("builds a pivot table in the wells, moves a chip from Rows to Columns, and keeps the table and the wells across a save and a reload", () => {
    const source = "User → Source";
    const category = "Product → Category";
    const createdAt = "Created At: Year";
    const categoryValue = "Doohickey";
    const pivotTable = () => cy.findByTestId("pivot-table");
    const pivotTopHeader = () => cy.findByLabelText("pivot-table-top-header");
    // a grouping that the question's layout doesn't have falls back to Rows, so the final
    // layout keeps two groupings in Columns, in an order that the query doesn't have
    const assertPivot = () => {
      H.assertSummaryWellItems("values", ["Count"]);
      H.assertSummaryWellItems("rows", [source]);
      H.assertSummaryWellItems("columns", [createdAt, category]);
      pivotTable().findByText(source).should("be.visible");
      pivotTopHeader()
        .findAllByText(categoryValue)
        .should("have.length.greaterThan", 0);
    };

    H.openOrdersTable();
    cy.intercept("POST", "/api/dataset").as("summaryQuery");
    cy.intercept("POST", "/api/dataset/pivot").as("pivotQuery");
    H.summarize();
    H.addSummaryValue("Count of rows");
    cy.wait("@summaryQuery");

    cy.log("two groupings in Rows and one in Columns");
    cy.button("Pivot into rows and columns").click();
    H.addSummaryRow("Source");
    cy.wait("@pivotQuery");
    H.addSummaryRow("Category");
    cy.wait("@pivotQuery");
    H.clickSummaryField("Created At", { section: "Orders" });
    cy.wait("@pivotQuery");
    H.changeSummaryGroupingBucket("Created At: Month", "Year");
    cy.wait("@pivotQuery").then(({ request }) => {
      expect(request.body.pivot_rows).to.have.length(2);
      expect(request.body.pivot_cols).to.have.length(1);
    });
    H.assertSummaryWellItems("rows", [source, category]);
    H.assertSummaryWellItems("columns", [createdAt]);
    pivotTable().findByText(category).should("be.visible");
    pivotTopHeader().findByText(categoryValue).should("not.exist");

    cy.log("a Rows chip dragged to Columns");
    H.dragSummaryItemToWell("rows", category, "columns");
    cy.wait("@pivotQuery").then(({ request, response }) => {
      expect(request.body.pivot_rows).to.have.length(1);
      expect(request.body.pivot_cols).to.have.length(2);
      expect(response?.body.error).to.eq(undefined);
    });
    assertPivot();

    cy.log("save");
    H.summarize();
    H.summarySidebar().should("not.exist");
    H.saveQuestionToCollection("Pivot round trip");
    cy.location("pathname").should("match", /^\/question\/\d+-/);

    cy.log("the saved question opens with the same pivot table and wells");
    cy.intercept("POST", "/api/card/pivot/*/query").as("cardPivotQuery");
    cy.reload();
    cy.wait("@cardPivotQuery").its("response.body.error").should("not.exist");
    H.queryBuilderHeader().button("Save").should("not.exist");
    H.summarize();
    assertPivot();
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
