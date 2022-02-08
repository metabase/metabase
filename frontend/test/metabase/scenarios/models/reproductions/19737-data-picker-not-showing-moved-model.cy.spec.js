import { restore, modal, popover } from "__support__/e2e/cypress";

const modelName = "Orders Model";

describe.skip("issue 19737", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/card/1", { name: modelName, dataset: true });
  });

  it("should show moved model in the data picker without refreshing (metabase#19737)", () => {
    cy.visit("/collection/root");

    openEllipsisMenuFor(modelName);
    popover()
      .contains("Move")
      .click();

    modal().within(() => {
      cy.findByText("My personal collection").click();
      cy.findByText("Move").click();
    });

    cy.findByText("Moved model");

    cy.findByText("New").click();
    cy.findByText("Question")
      .should("be.visible")
      .click();

    cy.findByText("Models").click();

    cy.findByText("Your personal collection").click();
    cy.findByText(modelName);
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click();
}
