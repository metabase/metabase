import { restore } from "__support__/e2e/cypress";

const GROUP = "collection";

describe("should update group count after editing a group", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should update the group count after adding a user to a group (metabase#12693)", () => {
    cy.visit("/admin/people/groups");

    findRow(GROUP).within(() => cy.findByText("3"));
    cy.findByText(GROUP).click();

    cy.findByText("Add members").click();
    cy.focused().type("Bobby");
    cy.findByText("Bobby Tables").click();
    cy.findByText("Add").click();
    cy.findByText("4 members");

    cy.findByText("Groups").click();
    findRow(GROUP).within(() => cy.findByText("4"));
  });
});

const findRow = text => {
  return cy.findByText(text).parentsUntil("tbody", "tr");
};
