import { H } from "e2e/support";

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
  });

  it("question item opens question notebook editor", () => {
    H.popover().within(() => {
      cy.findByText("Question").click();
    });

    cy.url("should.contain", "/question/notebook#");
  });

  it("question item opens SQL query editor", () => {
    H.popover().within(() => {
      cy.findByText("SQL query").click();
    });

    cy.url("should.contain", "/question#");
    H.nativeEditor().should("be.visible");
  });

  it("collection opens modal and redirects to a created collection after saving", () => {
    H.popover().within(() => {
      cy.findByText("Collection").click();
    });

    cy.findByTestId("new-collection-modal").then(modal => {
      cy.findByTestId("collection-picker-button").findByText("Our analytics");

      cy.findByPlaceholderText("My new fantastic collection").type(
        "Test collection",
      );
      cy.findByLabelText("Description").type("Test collection description");

      cy.findByText("Create").click();
    });

    cy.findByTestId("collection-name-heading").should(
      "have.text",
      "Test collection",
    );
  });
});
