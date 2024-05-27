import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, modal, popover, restore } from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("issue 36508", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should treat 'Number of distinct values' aggregation as numerical (metabase#36508)", () => {
    createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [
            ["distinct", ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }]],
          ],
          breakout: [["field", PEOPLE.SOURCE, { "base-type": "type/Text" }]],
          limit: 5,
        },
      },
      { visitQuestion: true },
    );

    cy.button("Filter").click();

    modal().within(() => {
      cy.findByText("Summaries").click();

      cy.findByTestId("filter-column-Distinct values of Email")
        .findByText("between")
        .should("exist")
        .click();
    });

    popover().within(() => {
      cy.findByText("Equal to").should("exist");
      cy.findByText("Greater than").should("exist");
      cy.findByText("Less than").should("exist");
    });
  });
});
