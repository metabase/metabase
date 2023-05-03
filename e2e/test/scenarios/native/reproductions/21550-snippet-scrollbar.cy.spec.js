import { restore, modal, openNativeEditor } from "e2e/support/helpers";

describe("issue 21550", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/collection/root/items?**").as("rootCollection");
    cy.intercept("GET", "/api/native-query-snippet/**").as("snippet");
  });

  it("should not show scrollbars for very short snippet (metabase#21550)", () => {
    openNativeEditor();

    cy.icon("snippet").click();
    cy.wait("@rootCollection");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Create a snippet").click();

    modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "select * from people",
      );
      cy.findByLabelText("Give your snippet a name").type("people");
      cy.findByText("Save").click();
      cy.wait("@rootCollection");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("people").realHover();
    cy.get(".Icon-chevrondown").click({ force: true });

    cy.get("pre").then($pre => {
      const preWidth = $pre[0].getBoundingClientRect().width;
      const clientWidth = $pre[0].clientWidth;
      const BORDERS = 2; // 1px left and right
      expect(clientWidth).to.be.gte(preWidth - BORDERS);
    });
  });
});
