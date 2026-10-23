const { H } = cy;

const BAR_COLOR = "#509EE3";

describe("scenarios > binning", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should bin a breakout, change its bucket and keep it after a save", () => {
    H.openOrdersTable();
    H.summarize();
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.log("temporal bucket");
    H.getDimensionByName({ name: "Created At" }).click();
    cy.wait("@dataset")
      .its("request.body.stages.0.breakout.0.1.temporal-unit")
      .should("eq", "month");
    H.changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
      isSelected: true,
    });
    cy.wait("@dataset").then((interception) => {
      cy.wrap(interception)
        .its("request.body.stages.0.breakout.0.1.temporal-unit")
        .should("eq", "year");
      cy.wrap(interception)
        .its("response.body.data.rows")
        .then((rows: unknown) => assertYearRows(rows));
    });

    cy.log("default binning");
    H.getDimensionByName({ name: "Total" }).click();
    cy.wait("@dataset")
      .its("request.body.stages.0.breakout.0.1.binning")
      .should("include", { strategy: "default" });
    H.queryBuilderHeader()
      .findByText("Count by Total: Auto binned")
      .should("be.visible");
    H.chartPathWithFillColor(BAR_COLOR).should("have.length.greaterThan", 1);

    cy.log("explicit binning strategy");
    H.changeBinningForDimension({
      name: "Total",
      fromBinning: "Auto binned",
      toBinning: "10 bins",
      isSelected: true,
    });
    cy.wait("@dataset")
      .its("request.body.stages.0.breakout.0.1.binning")
      .should("include", { strategy: "num-bins", "num-bins": 10 });
    H.queryBuilderHeader()
      .findByText("Count by Total: 10 bins")
      .should("be.visible");
    H.chartPathWithFillColor(BAR_COLOR)
      .should("have.length.greaterThan", 1)
      .and("have.length.at.most", 10);
    H.rightSidebar().button("Done").click();

    cy.log("the binning survives a save and a reload");
    H.saveQuestion("Binned totals");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.reload();
    cy.wait("@cardQuery")
      .its("response.body.data.cols.0.display_name")
      .should("eq", "Total: 10 bins");
    H.chartPathWithFillColor(BAR_COLOR)
      .should("have.length.greaterThan", 1)
      .and("have.length.at.most", 10);
  });
});

function assertYearRows(rows: unknown) {
  expect(rows).to.be.an("array").with.length.greaterThan(1);
  const years = (Array.isArray(rows) ? rows : []).map((row: unknown) =>
    Array.isArray(row) ? String(row[0]) : "",
  );
  years.forEach((year) => expect(year).to.match(/^\d{4}-01-01T/));
  H.echartsContainer().findByText(years[0].slice(0, 4)).should("exist");
}
