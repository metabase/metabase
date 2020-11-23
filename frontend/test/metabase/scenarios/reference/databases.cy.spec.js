import { signInAsAdmin, restore } from "__support__/cypress";

describe("scenarios > reference > databases", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should see the listing", () => {
    cy.visit("/reference/databases");
    cy.contains("Sample Dataset");
  });

  xit("should let the user navigate to details", () => {
    cy.visit("/reference/databases");
    cy.contains("Sample Dataset").click();
    cy.contains("Why this database is interesting");
  });

  it("should let an admin edit details about the database", () => {
    cy.visit("/reference/databases/1");
    cy.contains("Edit").click();
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.contains("Description")
      .parent()
      .parent()
      .find("textarea")
      .type("A pretty ok store");
    cy.contains("Save").click();
    cy.contains("A pretty ok store");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/databases/1");
    cy.contains("Edit").click();
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.contains("Why this")
      .parent()
      .parent()
      .find("textarea")
      .type("Turns out it's not");
    cy.contains("Cancel").click();
    cy.contains("Turns out").should("have.length", 0);
  });

  it("should let an admin edit the database name", () => {
    cy.visit("/reference/databases/1");
    cy.contains("Edit").click();
    cy.get(".wrapper input")
      .clear()
      .type("My definitely profitable business");
    cy.contains("Save").click();
    cy.contains("My definitely profitable business");
  });
});
