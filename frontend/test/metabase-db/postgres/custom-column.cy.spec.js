import { restore, addPostgresDatabase, popover } from "__support__/e2e/cypress";

const PG_DB_NAME = "QA Postgres12";

describe("postgres > question > custom columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    addPostgresDatabase(PG_DB_NAME);
  });

  it("should allow using strings in filter based on a custom column (metabase#13751)", () => {
    const CC_NAME = "C-States";

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("People").click();

    cy.log("Create custom column using `regexextract()`");

    cy.icon("add_data").click();
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

    cy.log("Add filter based on custom column");

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

    cy.button("Visualize").click();
    cy.findByText("Arnold Adams");
  });

  it.skip("should not remove regex escape characters (metabase#14517)", () => {
    // Ironically, both Prettier and Cypress remove escape characters from our code as well
    // We're testing for the literal sting `(?<=\/\/)[^\/]*`, but we need to escape the escape characters to make it work
    const ESCAPED_REGEX = "(?<=\\/\\/)[^\\/]*";

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("People").click();

    cy.log("Create custom column using `regexextract()`");

    cy.icon("add_data").click();
    popover().within(() => {
      cy.get("[contenteditable='true']")
        .type(`regexextract([State], "${ESCAPED_REGEX}")`)
        .blur();

      // It removes escaped characters already on blur
      cy.log("Reported failing on v0.36.4");
      cy.contains(ESCAPED_REGEX);
    });
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText(PG_DB_NAME).click();
    cy.findByText("Orders").click();
    cy.icon("add_data").click();
    cy.get("[contenteditable='true']")
      .click()
      .type("Percentile([Subtotal], 0.1)");
    cy.findByPlaceholderText("Something nice and descriptive")
      .as("description")
      .click();
    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    cy.get("@description").type("A");
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    // Todo: Add positive assertions once this is fixed
  });
});
