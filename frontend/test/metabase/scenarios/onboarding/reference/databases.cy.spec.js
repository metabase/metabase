import { popover, restore } from "__support__/e2e/cypress";

describe("scenarios > reference > databases", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

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

  describe("multiple databases sorting order", () => {
    beforeEach(() => {
      ["d", "b", "a", "c"].forEach(name => {
        cy.addH2SampleDataset({ name });
      });
    });

    it.skip("should sort data reference database list (metabase#15598)", () => {
      cy.visit("/browse");
      checkReferenceDatabasesOrder();

      cy.visit("/reference/databases/");
      checkReferenceDatabasesOrder();
    });

    it("should sort databases in new UI based question data selection popover", () => {
      checkQuestionSourceDatabasesOrder("Simple question");
      checkQuestionSourceDatabasesOrder("Custom question");
    });

    it.skip("should sort databases in new native question data selection popover", () => {
      checkQuestionSourceDatabasesOrder("Native query");
    });
  });
});

function checkReferenceDatabasesOrder() {
  cy.get("[class*=Card]")
    .as("databaseCard")
    .first()
    .should("have.text", "a");
  cy.get("@databaseCard")
    .last()
    .should("have.text", "Sample Dataset");
}

function checkQuestionSourceDatabasesOrder(question_type) {
  // Last item is "Saved Questions" for UI based questions so we have to check for the one before that (-2), and the last one for "Native" (-1)
  const lastDatabaseIndex = question_type === "Native query" ? -1 : -2;
  const selector =
    question_type === "Native query"
      ? ".List-item-title"
      : ".List-section-title";

  cy.visit("/question/new");
  cy.findByText(question_type).click();
  popover().within(() => {
    cy.get(selector)
      .as("databaseName")
      .first()
      .should("have.text", "a");
    cy.get("@databaseName")
      .eq(lastDatabaseIndex)
      .should("have.text", "Sample Dataset");
  });
}
