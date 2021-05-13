import { restore, visitQuestionAdhoc, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PEOPLE_ID } = SAMPLE_DATASET;

const testQuery = {
  database: 1,
  query: {
    "source-table": PEOPLE_ID,
  },
  type: "query",
};

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "table",
    });
    cy.wait("@dataset");

    cy.findByText("City").click();

    popover().within(() => {
      cy.icon("gear").click();
    });

    cy.findByText("Off").click();

    popover().within(() => {
      cy.findByText("Link").click();
    });
    // There is a lag caused by update of the table visualization which breaks Cypress typing.
    // Any field in the table will not be "actionable" (the whole table has an overlay with pointer-events set to none) so Cypress cannot click it.
    // Adding this line makes sure the table finished updating, and solves the typing issue.
    cy.findByText("Address").click();

    cy.findByTestId("link_text").type("{{CITY}} {{ID}} fixed text", {
      parseSpecialCharSequences: false,
    });

    cy.findByTestId("link_url").type("http://metabase.com/people/{{ID}}", {
      parseSpecialCharSequences: false,
    });

    cy.findByText("Done").click();

    cy.findByText("Wood River 1 fixed text").should(
      "have.attr",
      "href",
      "http://metabase.com/people/1",
    );
  });
});
