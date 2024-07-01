import {
  restore,
  startNewQuestion,
  entityPickerModal,
  entityPickerModalTab,
  mockSessionProperty,
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
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Orders").should("exist");
      cy.findAllByRole("tab").should("not.exist");

      // Ensure the search doesn't list saved questions
      cy.findByPlaceholderText("Search…").type("Ord");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findAllByTestId("result-item").then($result => {
        const searchResults = $result.toArray();
        const modelTypes = new Set(
          searchResults.map(k => k.getAttribute("data-model-type")),
        );

        expect(modelTypes).not.to.include("card");
        expect(modelTypes).to.include("table");
      });

      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    cy.icon("join_left_outer").click();
    entityPickerModal().findAllByRole("tab").should("not.exist");

    // Test "Explore results" button is hidden for native questions
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TEST_NATIVE_QUESTION_NAME).click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").should("not.exist");
  });
});
