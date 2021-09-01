import { restore } from "__support__/e2e/cypress";

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
        cy.createNativeQuestion({
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
        }).then(({ body: { id: QUESTION_ID } }) => {
          cy.visit(`/question/${QUESTION_ID}`);
        });

        cy.get(".Visualization").within(() => {
          ["a", "b", "c", "d", "e", "f"].forEach(letter => {
            cy.findByText(letter);
          });
        });
      },
    );
  });
});
