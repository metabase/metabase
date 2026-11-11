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
