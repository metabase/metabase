import { restore } from "e2e/support/helpers";

describe("scenarios > visualizations > rows", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // Until we enable multi-browser support, this repro will be skipped by Cypress in CI
  // Issue was specific to Firefox only - it is still possible to test it locally
  ["0", "null"].forEach(testValue => {
    it(
      `should not collapse rows when last value is ${testValue} (metabase#14285)`,
      { browser: "firefox" },
      () => {
        cy.createNativeQuestion(
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
          ["a", "b", "c", "d", "e", "f"].forEach(letter => {
            cy.findByText(letter);
          });
        });
      },
    );
  });

  it("should display a row chart", () => {
    cy.createNativeQuestion(
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
      ["a", "b", "c", "d", "e", "f"].forEach(letter => {
        cy.findByText(letter);
      });
      [51, 41, 31, 21, 11, 4].forEach(value => {
        cy.findByText(value);
      });
      cy.findByText("COLUMN_TWO");
    });
  });
});
