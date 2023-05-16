import { restore, withDatabase } from "e2e/support/helpers";

const CC_NAME = "Abbr";

describe.skip("issue 12445", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("should correctly apply substring for a custom column (metabase#12445)", () => {
    withDatabase(2, ({ PEOPLE, PEOPLE_ID }) => {
      cy.log("Create a question with `Source` column and abbreviated CC");
      cy.createQuestion(
        {
          name: "12445",
          query: {
            "source-table": PEOPLE_ID,
            breakout: [["expression", CC_NAME]],
            expressions: {
              [CC_NAME]: [
                "substring",
                ["field", PEOPLE.SOURCE, null],
                1,
                4, // we want 4 letter abbreviation
              ],
            },
          },
          database: 2,
        },
        { visitQuestion: true },
      );

      cy.findByText(CC_NAME);
      cy.findByText("Goog");
    });
  });
});
