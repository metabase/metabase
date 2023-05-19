import { popover, restore, startNewQuestion } from "e2e/support/helpers";

describe("scenarios > reference > databases", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // QUESTION - I think this is checked another way
  it("should let an admin edit details about the database", () => {
    cy.visit("/reference/databases/1");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Edit").click();
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Description")
      .parent()
      .parent()
      .find("textarea")
      .type("A pretty ok store");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("A pretty ok store");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/databases/1");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Edit").click();
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Why this")
      .parent()
      .parent()
      .find("textarea")
      .type("Turns out it's not");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Cancel").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Turns out").should("have.length", 0);
  });

  // QUESTION - I think this is / can be checked another way?
  it("should let an admin edit the database name", () => {
    cy.visit("/reference/databases/1");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Edit").click();
    cy.get(".wrapper input").clear().type("My definitely profitable business");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("My definitely profitable business");
  });

  // QUESTION - how else can we check this?
  describe("multiple databases sorting order", () => {
    beforeEach(() => {
      ["d", "b", "a", "c"].forEach(name => {
        cy.addH2SampleDatabase({ name });
      });
    });

    it.skip("should sort data reference database list (metabase#15598)", () => {
      cy.visit("/browse");
      checkReferenceDatabasesOrder();

      cy.visit("/reference/databases/");
      checkReferenceDatabasesOrder();
    });

    it("should sort databases in new UI based question data selection popover", () => {
      checkQuestionSourceDatabasesOrder();
    });

    it.skip("should sort databases in new native question data selection popover", () => {
      checkQuestionSourceDatabasesOrder("Native query");
    });
  });
});

function checkReferenceDatabasesOrder() {
  cy.get("[class*=Card]").as("databaseCard").first().should("have.text", "a");
  cy.get("@databaseCard").last().should("have.text", "Sample Database");
}

function checkQuestionSourceDatabasesOrder(question_type) {
  // Last item is "Saved Questions" for UI based questions so we have to check for the one before that (-2), and the last one for "Native" (-1)
  const lastDatabaseIndex = question_type === "Native query" ? -1 : -2;
  const selector =
    question_type === "Native query"
      ? ".List-item-title"
      : ".List-section-title";

  startNewQuestion();
  popover().within(() => {
    cy.get(selector).as("databaseName").first().should("have.text", "a");
    cy.get("@databaseName")
      .eq(lastDatabaseIndex)
      .should("have.text", "Sample Database");
  });
}
