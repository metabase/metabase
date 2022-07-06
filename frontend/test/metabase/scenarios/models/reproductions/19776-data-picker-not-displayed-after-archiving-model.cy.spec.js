import { restore, popover } from "__support__/e2e/helpers";

const modelName = "Orders Model";

describe("issue 19776", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/card/1", { name: modelName, dataset: true });
  });

  it("should show moved model in the data picker without refreshing (metabase#19776)", () => {
    cy.visit("/collection/root");

    openEllipsisMenuFor(modelName);
    popover().contains("Archive").click();

    cy.findByText("Archived model");

    cy.findByText("New").click();
    cy.findByText("Question").should("be.visible").click();

    cy.findByText("Sample Database");
    cy.findByText("Saved Questions");
    cy.findByText("Models").should("not.exist");
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
}
