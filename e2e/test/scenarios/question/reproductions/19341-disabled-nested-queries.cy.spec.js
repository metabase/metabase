import {
  restore,
  mockSessionProperty,
  popover,
  startNewQuestion,
} from "e2e/support/helpers";

describe("issue 19341", () => {
  const TEST_NATIVE_QUESTION_NAME = "Native";

  beforeEach(() => {
    restore();
    mockSessionProperty("enable-nested-queries", false);
    cy.signInAsAdmin();
    cy.createNativeQuestion({
      name: TEST_NATIVE_QUESTION_NAME,
      native: {
        query: "SELECT * FROM products",
      },
    });
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should correctly disable nested queries (metabase#19341)", () => {
    // Test "Saved Questions" table is hidden in QB data selector
    startNewQuestion();
    popover().within(() => {
      // Wait until picker init
      // When working as expected, the test environment only has "Sample Database" DB
      // So it should automatically select it as a database
      // When "Orders" table name appears, it means the picker has selected the sample database
      cy.findByText("Loading...").should("not.exist");
      cy.findByText("Orders");

      cy.findByText("Sample Database").click(); // go back to DB list
      cy.findByText("Saved Questions").should("not.exist");

      // Ensure the search doesn't list saved questions
      cy.findByPlaceholderText("Search for a table…").type("Ord");
      cy.findByText("Loading...").should("not.exist");
      cy.findAllByText(/Saved question in/i).should("not.exist");
      cy.findAllByText(/Table in/i).should("exist");
      cy.icon("close").click();

      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.icon("join_left_outer").click();
    popover().within(() => {
      cy.findByText("Sample Database").click(); // go back to DB list
      cy.findByText("Saved Questions").should("not.exist");
    });

    // Test "Explore results" button is hidden for native questions
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TEST_NATIVE_QUESTION_NAME).click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").should("not.exist");
  });
});
