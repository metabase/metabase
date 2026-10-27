const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

const BAR_COLOR = "#509EE3";

const BUCKET_CASES = [
  {
    title: "a number column into 10 bins",
    tableId: PRODUCTS_ID,
    breakout: [
      "field",
      PRODUCTS.PRICE,
      { binning: { strategy: "num-bins", "num-bins": 10 } },
    ],
    rows: [
      [10, 2],
      [20, 25],
      [30, 29],
      [40, 38],
      [50, 22],
      [60, 15],
      [70, 35],
      [80, 24],
      [90, 10],
    ],
  },
  {
    title: "a coordinate column every 20 degrees",
    tableId: PEOPLE_ID,
    breakout: [
      "field",
      PEOPLE.LONGITUDE,
      { binning: { strategy: "bin-width", "bin-width": 20 } },
    ],
    rows: [
      [-180, 10],
      [-160, 55],
      [-140, 107],
      [-120, 508],
      [-100, 1507],
      [-80, 313],
    ],
  },
  {
    title: "a temporal column by quarter of year",
    tableId: ORDERS_ID,
    breakout: [
      "field",
      ORDERS.CREATED_AT,
      { "base-type": "type/DateTime", "temporal-unit": "quarter-of-year" },
    ],
    rows: [
      [1, 5313],
      [2, 4203],
      [3, 4402],
      [4, 4842],
    ],
  },
];

describe("scenarios > binning", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should bin a breakout, change its bucket and keep it after a save", () => {
    H.openOrdersTable();
    H.summarize();
    cy.intercept("POST", "/api/dataset").as("breakoutQuery");

    cy.log("temporal bucket");
    H.getDimensionByName({ name: "Created At" }).click();
    cy.wait("@breakoutQuery")
      .its("request.body.stages.0.breakout.0.1.temporal-unit")
      .should("eq", "month");
    H.changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
      isSelected: true,
    });
    cy.wait("@breakoutQuery").then((interception) => {
      cy.wrap(interception)
        .its("request.body.stages.0.breakout.0.1.temporal-unit")
        .should("eq", "year");
      cy.wrap(interception)
        .its("response.body.data.rows")
        .then((rows: unknown) => assertYearRows(rows));
    });

    cy.log("default binning");
    H.getDimensionByName({ name: "Total" }).click();
    cy.wait("@breakoutQuery")
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
    cy.wait("@breakoutQuery")
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
    H.saveQuestion("Binned totals", undefined, { path: ["Our analytics"] });
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.reload();
    cy.wait("@cardQuery")
      .its("response.body.data.cols.0.display_name")
      .should("eq", "Total: 10 bins");
    H.chartPathWithFillColor(BAR_COLOR)
      .should("have.length.greaterThan", 1)
      .and("have.length.at.most", 10);
  });

  BUCKET_CASES.forEach(({ title, tableId, breakout, rows }) => {
    it(`should bucket ${title}`, () => {
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": tableId,
            aggregation: [["count"]],
            breakout: [breakout],
          },
        },
        display: "table",
      })
        .its("response.body.data.rows")
        .should("deep.equal", rows);
    });
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
