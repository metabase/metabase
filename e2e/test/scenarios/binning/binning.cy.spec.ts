const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const BAR_COLOR = "#509EE3";

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
    cy.wait("@breakoutQuery").then(({ request, response }) => {
      expect(request.body.stages[0].breakout[0][1]["temporal-unit"]).to.eq(
        "year",
      );
      const rows: [string, number][] = response?.body.data.rows ?? [];
      expect(rows).to.have.length.greaterThan(1);
      rows.forEach(([year]) => expect(year).to.match(/^\d{4}-01-01T/));
      H.echartsContainer()
        .findByText(rows[0][0].slice(0, 4))
        .should("be.visible");
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
    H.saveQuestionToCollection("Binned totals");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.reload();
    cy.wait("@cardQuery")
      .its("response.body.data.cols.0.display_name")
      .should("eq", "Total: 10 bins");
    H.queryBuilderHeader()
      .findByDisplayValue("Binned totals")
      .should("be.visible");
    H.echartsContainer().findByText("Total: 10 bins").should("be.visible");
    H.chartPathWithFillColor(BAR_COLOR)
      .should("have.length.greaterThan", 1)
      .and("have.length.at.most", 10);
  });

  it("should run a query that breaks out by a temporal column of a joined native question (metabase#18646)", () => {
    const joinAlias = "18646 - Product";

    H.createNativeQuestion(
      {
        name: "18646",
        native: { query: "select * from products" },
      },
      { loadMetadata: true, wrapId: true },
    );

    cy.get<number>("@questionId").then((cardId) => {
      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                alias: joinAlias,
                "source-table": `card__${cardId}`,
                fields: "all",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  [
                    "field",
                    "ID",
                    { "base-type": "type/BigInteger", "join-alias": joinAlias },
                  ],
                ],
              },
            ],
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                "CREATED_AT",
                {
                  "base-type": "type/DateTimeWithLocalTZ",
                  "join-alias": joinAlias,
                  "temporal-unit": "month",
                },
              ],
            ],
          },
        },
        display: "line",
      });
    });

    H.cartesianChartCircle().should("have.length.greaterThan", 1);
  });

  it("can drill through question with temporal extraction breakout without semantic type defined for the column (metabase#23851)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "day-of-week" },
            ],
          ],
        },
        display: "bar",
      },
      { visitQuestion: true },
    );

    H.chartPathWithFillColor(BAR_COLOR).should("have.length", 7);
    H.chartPathWithFillColor(BAR_COLOR).eq(5).click();
    H.popover().findByText("See these Orders").click();

    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At: Day of week is equal to 6",
    );
    cy.findAllByTestId("cell-data").should("contain", "37.65");
    H.openNotebook();
    H.getNotebookStep("filter")
      .findByText("Created At: Day of week is equal to 6")
      .should("be.visible");
  });
});
