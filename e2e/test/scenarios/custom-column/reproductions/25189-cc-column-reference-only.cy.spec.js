import { restore, filter, summarize } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ccTable = "Custom Created";
const ccFunction = "Custom Total";

const questionDetails = {
  name: "25189",
  query: {
    "source-table": ORDERS_ID,
    limit: 5,
    expressions: {
      [ccTable]: ["field", ORDERS.CREATED_AT, null],
      [ccFunction]: [
        "case",
        [[[">", ["field", ORDERS.TOTAL, null], 100], "Yay"]],
        {
          default: "Nay",
        },
      ],
    },
  },
};

describe.skip("issue 25189", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(
      ({ body: { id: baseQuestionId } }) => {
        cy.createQuestion(
          {
            name: "Nested 25189",
            query: { "source-table": `card__${baseQuestionId}` },
          },
          { visitQuestion: true },
        );
      },
    );
  });

  it("custom column referencing only a single column should not be dropped in a nested question (metabase#25189)", () => {
    // 1. Column should not be dropped
    cy.findAllByTestId("header-cell")
      .should("contain", ccFunction)
      .and("contain", ccTable);

    // 2. We shouldn't see duplication in the bulk filter modal
    filter();
    cy.get(".Modal").within(() => {
      // Implicit assertion - will fail if more than one element is found
      cy.findByText(ccFunction);
      cy.findByText(ccTable);

      cy.findByText("Today").click();
      cy.button("Apply Filters").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results!");

    // 3. We shouldn't see duplication in the breakout fields
    summarize();
    cy.findByTestId("sidebar-content").within(() => {
      // Another implicit assertion
      cy.findByText(ccFunction);
      cy.findByText(ccTable);
    });
  });
});
