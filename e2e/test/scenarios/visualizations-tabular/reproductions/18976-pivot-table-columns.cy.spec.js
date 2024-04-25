import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, rightSidebar, visitQuestionAdhoc } from "e2e/support/helpers";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "native",
    native: {
      query: "select 'a', 'b'",
      "template-tags": {},
    },
  },
  visualization_settings: {
    "table.pivot": true,
    "table.pivot_column": "'a'",
    "table.cell_column": "1",
  },
};

describe("issue 18976, 18817", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a pivot table as regular one when pivot columns are missing (metabase#18976)", () => {
    visitQuestionAdhoc(questionDetails);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
  });

  it("should not keep orphan columns rendered after switching from pivot to regular table (metabase#18817)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PEOPLE.NAME],
            ["field", PEOPLE.SOURCE],
          ],
          limit: 5,
        },
        database: SAMPLE_DB_ID,
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findByTestId("qb-header").button("Summarize").click();
    rightSidebar()
      .findByLabelText("Source")
      .findByRole("button", { name: "Remove dimension" })
      .click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 2)
      .and("contain", "Name")
      .and("contain", "Count");
  });
});
