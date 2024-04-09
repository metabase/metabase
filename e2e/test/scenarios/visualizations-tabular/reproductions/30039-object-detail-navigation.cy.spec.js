import { openNativeEditor, restore, runNativeQuery } from "e2e/support/helpers";

describe("issue 30039", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not trigger object detail navigation after the modal was closed (metabase#30039)", () => {
    openNativeEditor().type("select * from ORDERS LIMIT 2");
    runNativeQuery();
    cy.findAllByTestId("detail-shortcut").first().click();
    cy.findByTestId("object-detail").should("be.visible");

    cy.realPress("{esc}");
    cy.findByTestId("object-detail").should("not.exist");

    cy.get("@editor").type("{downArrow};");
    runNativeQuery();
    cy.findByTestId("object-detail").should("not.exist");
  });
});
