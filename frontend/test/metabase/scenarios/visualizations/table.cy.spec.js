import { restore, openPeopleTable, popover } from "__support__/e2e/cypress";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    openPeopleTable();
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

  it.skip("should close the colum popover on subsequent click (metabase#16789)", () => {
    openPeopleTable();
    cy.wait("@dataset");

    cy.findByText("City").click();
    popover().within(() => {
      cy.icon("arrow_up");
      cy.icon("arrow_down");
      cy.icon("gear");
      cy.findByText("Filter by this column");
      cy.findByText("Distribution");
      cy.findByText("Distincts");
    });

    cy.findByText("City").click();
    // Although arbitrary waiting is considered an anti-pattern and a really bad practice, I couldn't find any other way to reproduce this issue.
    // Cypress is too fast and is doing the assertions in that split second while popover is reloading which results in a false positive result.
    cy.wait(100);
    popover().should("not.exist");
  });
});
