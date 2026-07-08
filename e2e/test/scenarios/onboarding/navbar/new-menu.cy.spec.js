const { H } = cy;

describe("metabase > scenarios > navbar > new menu", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.visit("/");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.NativeEditor.get().should("be.visible");
  });
});
