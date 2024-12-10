import { H } from "e2e/support";

describe("scenarios > reference > databases", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should see the listing", () => {
    cy.visit("/reference/databases");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database");
  });

  xit("should let the user navigate to details", () => {
    cy.visit("/reference/databases");
    cy.contains("Sample Database").click();
    cy.contains("Why this database is interesting");
  });

  it("should let an admin edit details about the database", () => {
    cy.visit("/reference/databases/1");

    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.findByPlaceholderText("No description yet").type("A pretty ok store");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("A pretty ok store");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/databases/1");
    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");
    // Q - is there any cleaner way to get a nearby element without having to know the DOM?
    cy.findByPlaceholderText("Nothing interesting yet").type(
      "Turns out it's not",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Cancel").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Turns out").should("have.length", 0);
  });

  it("should let an admin edit the database name", () => {
    cy.visit("/reference/databases/1");
    // For some unknown reason, calling .click() causes the form to immediately reset, putting us
    // in a state like we never clicked the edit button TODO: Fix
    cy.button(/Edit/).trigger("click");

    cy.findByPlaceholderText("Sample Database")
      .clear()
      .type("My definitely profitable business");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("My definitely profitable business");
  });

  describe("multiple databases sorting order", () => {
    beforeEach(() => {
      ["d", "b", "a", "c"].forEach(name => {
        cy.addSQLiteDatabase({ name });
      });
    });

    it.skip("should sort data reference database list (metabase#15598)", () => {
      cy.visit("/browse");
      checkReferenceDatabasesOrder();

      cy.visit("/reference/databases/");
      checkReferenceDatabasesOrder();
    });

    it("should sort databases in new UI based question data selection popover", () => {
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByTestId("item-picker-level-0").within(() => {
          cy.get("[data-index='0']").should("contain.text", "a");
          cy.get("[data-index='1']").should("contain.text", "b");
          cy.get("[data-index='2']").should("contain.text", "c");
          cy.get("[data-index='3']").should("contain.text", "d");
          cy.get("[data-index='4']").should("contain.text", "Sample Database");
        });
      });
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

function checkQuestionSourceDatabasesOrder() {
  // Last item is "Saved Questions" for UI based questions so we have to check for the one before that (-2), and the last one for "Native" (-1)
  const lastDatabaseIndex = -1;
  const selector = "[data-element-id=list-item]-title";

  H.startNewQuestion();
  H.popover().within(() => {
    cy.findByText("Raw Data").click();
    cy.get(selector).as("databaseName").eq(1).should("have.text", "a");
    cy.get("@databaseName")
      .eq(lastDatabaseIndex)
      .should("have.text", "Sample Database");
  });
}
