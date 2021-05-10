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
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "table",
    });

    cy.findByText("City").click();

    popover().within(() => {
      cy.icon("gear").click();
    });

    cy.findByText("Off").click();

    popover().within(() => {
      cy.findByText("Link").click();
    });

    cy.findByTestId("link_text").should("have.value", "{{CITY}}");
    cy.findByTestId("link_text").type(" {{ID}} fixed text", {
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
