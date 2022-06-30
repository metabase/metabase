import { restore } from "__support__/e2e/helpers";

const GROUP = "collection";

describe("Should be able to add and remove users from groups", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a user, then remove that user without reloading (metabase#21521)", () => {
    cy.visit("/admin/people/groups");

    findRow(GROUP).within(() => cy.findByText("3"));
    cy.findByText(GROUP).click();

    cy.findByText("Add members").click();
    cy.focused().type("Bobby");
    cy.findByText("Bobby Tables").click();
    cy.findByText("Add").click();
    cy.findByText("4 members");

    cy.findByText("Bobby Tables")
      .siblings(".text-right")
      .find(".Icon-close")
      .click();

    cy.findByText("3 members");
  });
});

const findRow = text => {
  return cy.findByText(text).parentsUntil("tbody", "tr");
};
