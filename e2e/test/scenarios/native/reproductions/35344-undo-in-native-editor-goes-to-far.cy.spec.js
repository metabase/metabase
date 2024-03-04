import { restore } from "e2e/support/helpers";

const questionDetails = {
  name: "REVIEWS SQL",
  native: { query: "select REVIEWER from REVIEWS" },
};

describe("issue 35344", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not allow the user to undo to the empty editor (metabase#35344)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();

    // make sure normal undo still works
    cy.findByTestId("native-query-editor").type("--");
    expect(cy.findByTestId("native-query-editor").findByText("--")).to.exist;

    cy.findByTestId("native-query-editor").type("{meta}z");
    cy.findByTestId("native-query-editor").findByText("--").should("not.exist");

    // more undoing does not change to empty editor
    cy.findByTestId("native-query-editor").type("{meta}z");
    expect(cy.findByTestId("native-query-editor").findByText("select")).to
      .exist;
  });
});
