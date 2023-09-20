import { restore, popover } from "e2e/support/helpers";

const modelName = "Orders Model";

describe("issue 19776", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show moved model in the data picker without refreshing (metabase#19776)", () => {
    cy.visit("/collection/root");

    openEllipsisMenuFor(modelName);
    popover().contains("Archive").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Archived model");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sample Database");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Models").should("not.exist");
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item).closest("tr").find(".Icon-ellipsis").click();
}
