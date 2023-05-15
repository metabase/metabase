import { restore, popover, modal } from "e2e/support/helpers";

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
  });

  it("question item opens question notebook editor", () => {
    popover().within(() => {
      cy.findByText("Question").click();
    });

    cy.url("should.contain", "/question/notebook#");
  });

  it("question item opens SQL query editor", () => {
    popover().within(() => {
      cy.findByText("SQL query").click();
    });

    cy.url("should.contain", "/question#");
    cy.get(".ace_content");
  });

  it("collection opens modal and redirects to a created collection after saving", () => {
    popover().within(() => {
      cy.findByText("Collection").click();
    });

    modal().within(() => {
      cy.findByText("Our analytics");

      cy.findByLabelText("Name").type("Test collection");
      cy.findByLabelText("Description").type("Test collection description");

      cy.findByText("Create").click();
    });

    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "Test collection",
    );
  });
});
