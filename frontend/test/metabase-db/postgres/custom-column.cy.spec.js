import {
  signInAsAdmin,
  restore,
  addPostgresDatabase,
  popover,
} from "__support__/cypress";

const PG_DB_NAME = "QA Postgres12";

describe("postgres > question > custom columns", () => {
  before(() => {
    restore();
    signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
  });

  it.skip("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    const CC_NAME = "C-States";

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("People").click();

    cy.log("**-- 1. Create custom column using `regexextract()` --**");

    cy.get(".Icon-add_data").click();
    popover().within(() => {
      cy.get("[contenteditable='true']").type(
        'regexextract([State], "^C[A-Z]")',
      );
      cy.findByPlaceholderText("Something nice and descriptive").type(CC_NAME);
      cy.get(".Button")
        .contains("Done")
        .should("not.be.disabled")
        .click();
    });

    cy.log("**-- 2. Add filter based on custom column--**");

    cy.findByText("Add filters to narrow your answer").click();
    popover().within(() => {
      cy.findByText(CC_NAME).click();
      cy.get(".AdminSelect").click();
      cy.log(
        "**It fails here already because it doesn't find any condition for strings. Only numbers.**",
      );
      cy.findByText("Is");
      cy.get("input").type("CO");
      cy.get(".Button")
        .contains("Add filter")
        .should("not.be.disabled")
        .click();
    });

    cy.findByText("Visualize").click();
    cy.findByText("Arnold Adams");
  });
});
