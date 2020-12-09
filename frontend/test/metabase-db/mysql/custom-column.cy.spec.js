import {
  restore,
  signInAsAdmin,
  addMySQLDatabase,
  withDatabase,
} from "__support__/cypress";

const MYSQL_DB_NAME = "QA MySQL8";

// NOTE: skipping the whole describe block because #12445 is the only test so far
describe.skip("mysql > user > question > custom column", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    addMySQLDatabase(MYSQL_DB_NAME);
  });

  // TODO: When you unskip this test, unskip the describe block as well
  it.skip("should correctly apply substring for a custom column (metabase#12445)", () => {
    const CC_NAME = "Abbr";

    withDatabase(2, ({ PEOPLE, PEOPLE_ID }) => {
      cy.log(
        "**--1. Create a question with `Source` column and abbreviated CC--**",
      );
      cy.request("POST", "/api/card", {
        name: "12445",
        dataset_query: {
          type: "query",
          query: {
            "source-table": PEOPLE_ID,
            breakout: [["expression", CC_NAME]],
            expressions: {
              [CC_NAME]: [
                "substring",
                ["field-id", PEOPLE.SOURCE],
                0,
                4, // we want 4 letter abbreviation
              ],
            },
          },
          database: 2,
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.visit(`/question/${QUESTION_ID}`);

        cy.wait("@cardQuery");
        cy.findByText(CC_NAME);
        cy.findByText("Goog");
      });
    });
  });
});
