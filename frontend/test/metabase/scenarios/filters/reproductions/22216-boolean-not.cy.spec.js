import {
  restore,
  filter,
  enterCustomColumnDetails,
} from "__support__/e2e/cypress";

const questionDetails = {
  name: "Test Boolean",
  native: { query: "select true as Awesome, false as Terrible" },
};

describe("issue 22216", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with boolean NOT (metabase#22216)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByText("Explore results").click();
    cy.wait("@dataset");

    filter();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "[AWESOME] = NOT [Terrible]" });

    cy.button("Done").click();
    cy.wait("@dataset");

    cy.findByTextEnsureVisible("AWESOME = NOT TERRIBLE");
    cy.findByText("AWESOME = NOT TERRIBLE = True").should("not.be.visible");
  });
});
