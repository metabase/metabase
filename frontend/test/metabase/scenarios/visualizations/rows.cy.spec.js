import { restore, signInAsAdmin } from "__support__/cypress";

describe("scenarios > visualizations > rows", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  // Until we enable multi-browser support, this repro will be skipped by Cypress in CI
  // Issue was specific to Firefox only - it is still possible to test it locally
  it(
    "should not collapse rows when last value is 0 (metabase#14285)",
    { browser: "firefox" },
    () => {
      cy.request("POST", "/api/card", {
        name: "14285",
        dataset_query: {
          type: "native",
          native: {
            query:
              "with temp as (\n select 'a' col1, 25 col2\n union all \n select 'b', 10\n union all \n select 'c', 15\n union all \n select 'd', 0\n union all\n select 'e', 30\n union all \n select 'f', 35\n)\nselect * from temp\norder by 2 desc",
            "template-tags": {},
          },
          database: 1,
        },
        display: "row",
        visualization_settings: {},
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
