import {
  restore,
  withDatabase,
  visitQuestionAdhoc,
} from "__support__/e2e/helpers";

const PG_DB_ID = 2;

describe("issue 14148", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("postgres should display pivot tables (metabase#14148)", () => {
    withDatabase(PG_DB_ID, ({ PEOPLE, PEOPLE_ID }) =>
      visitQuestionAdhoc(
        {
          display: "pivot",
          dataset_query: {
            type: "query",
            database: PG_DB_ID,
            query: {
              "source-table": PEOPLE_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", PEOPLE.SOURCE, null],
                ["field", PEOPLE.CREATED_AT, { "temporal-unit": "year" }],
              ],
            },
          },
        },
        {
          callback: xhr =>
            expect(xhr.response.body.cause || "").not.to.contain("ERROR"),
        },
      ),
    );

    cy.log(
      "Reported failing on v0.38.0-rc1 querying Postgres, Redshift and BigQuery. It works on MySQL and H2.",
    );

    cy.findByText(/Grand totals/i);
    cy.findByText("2,500");
  });
});
