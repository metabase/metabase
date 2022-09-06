import {
  restore,
  POPOVER_ELEMENT,
  openNativeEditor,
} from "__support__/e2e/helpers";

const questionDetails = {
  name: "REVIEWS SQL",
  native: { query: "select REVIEWER from REVIEWS LIMIT 1" },
};

describe("issue 18418", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("cardCreated");

    restore();
    cy.signInAsAdmin();
  });

  it("should not show saved questions DB in native question's DB picker (metabase#18418)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByText("Explore results").click();

    cy.findByText("Save").click();

    cy.get(".Modal").button("Save").click();

    cy.button("Not now").click();

    openNativeEditor({ fromCurrentPage: true });

    // Clicking native question's database picker usually opens a popover with a list of databases
    // As default Cypress environment has only the sample database available, we expect no popup to appear
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.get(POPOVER_ELEMENT).should("not.exist");
  });
});
