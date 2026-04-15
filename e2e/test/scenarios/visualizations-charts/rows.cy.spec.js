import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > rows", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  // Until we enable multi-browser support, this repro will be skipped by Cypress in CI
  // Issue was specific to Firefox only - it is still possible to test it locally
  ["0", "null"].forEach((testValue) => {
    it(
      `should not collapse rows when last value is ${testValue} (metabase#14285)`,
      { browser: "firefox" },
      () => {
        H.createNativeQuestion(
          {
            name: "14285",
            native: {
              query: `
              with temp as (
                select 'a' col1, 25 col2 union all
                select 'b', 10 union all
                select 'c', 15 union all
                select 'd', ${testValue} union all
                select 'e', 30 union all
                select 'f', 35
              ) select * from temp
              order by 2 desc
            `,
              "template-tags": {},
            },
            display: "row",
          },
          { visitQuestion: true },
        );

        cy.findByTestId("query-visualization-root").within(() => {
          ["a", "b", "c", "d", "e", "f"].forEach((letter) => {
            cy.findByText(letter);
          });
        });
      },
    );
  });

  it("should display a row chart", () => {
    H.createNativeQuestion(
      {
        name: "14285",
        native: {
          query: `
            with temp as (
              select 'a' col1, 51 column_two union all
              select 'b', 41 union all
              select 'c', 31 union all
              select 'd', 21 union all
              select 'e', 11 union all
              select 'f', 4
            ) select * from temp
            order by 2 desc
          `,
          "template-tags": {},
        },
        display: "row",
        visualization_settings: {
          "graph.show_values": true, // so we can assert on them
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("query-visualization-root").within(() => {
      ["a", "b", "c", "d", "e", "f"].forEach((letter) => {
        cy.findByText(letter);
      });
      [51, 41, 31, 21, 11, 4].forEach((value) => {
        cy.findByText(value);
      });
      cy.findByText("COLUMN_TWO");
    });

    // Verify hovering bars does not change their size (metabase#43631)
    cy.findAllByRole("graphics-symbol").eq(0).as("firstBar");
    cy.get("@firstBar")
      .invoke("width")
      .then((prevWidth) => {
        cy.get("@firstBar")
          .realHover()
          .invoke("width")
          .then((newWidth) => {
            // eslint-disable-next-line metabase/no-unsafe-element-filtering
            expect(prevWidth).eq(newWidth);
          });
      });
  });

  it("should handle very long product titles in row chart", () => {
    H.createQuestion(
      {
        name: "Orders created before June 1st 2022",
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            LongName: [
              "concat",
              ..._.times(10, () => {
                return [
                  "field",
                  PRODUCTS.TITLE,
                  {
                    "base-type": "type/Text",
                  },
                ];
              }),
            ],
          },
          aggregation: [["count"]],
          breakout: [
            [
              "expression",
              "LongName",
              {
                "base-type": "type/Text",
              },
            ],
          ],
        },
        display: "row",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("query-visualization-root").within(() => {
      // Check that the visualization renders without errors
      cy.findAllByRole("graphics-symbol").should("have.length.greaterThan", 0);

      // Check chart bars section - it should take 50% of width
      cy.get(".visx-columns")
        .should("exist")
        .invoke("width")
        .should("be.gt", 500);

      // Check that axis labels are present
      cy.get(".visx-axis-left")
        .should("exist")
        .invoke("width")
        .should("be.gt", 500);
    });
  });

  it("should display an error message when there are more series than the chart supports", () => {
    H.visitQuestionAdhoc({
      display: "row",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.TITLE, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TITLE"],
        "graph.metrics": ["count"],
      },
    });

    H.main().findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
  });

  it("should show error when adding high-cardinality breakout via UI (metabase#64086)", () => {
    const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

    H.visitQuestionAdhoc({
      display: "row",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "minute" }],
            ["field", ORDERS.ID, null],
          ],
        },
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    });

    H.openVizSettingsSidebar();
    H.leftSidebar().within(() => {
      cy.findByText("Data").click();
      cy.findByText("Add series breakout").click();
    });

    H.main().findByText(
      "This chart type doesn't support more than 100 series of data.",
    );
  });
});
