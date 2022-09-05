import { modal, popover, restore } from "__support__/e2e/helpers";

describe("issue 25144", () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();
  });

  it("should show Saved Questions after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    cy.findByText("Save").click();
    modal().button("Save").click();
    modal().button("Not now").click();

    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Saved Questions").click();
    popover().findByText("Orders").should("be.visible");
  });
});
