import {
  openNativeEditor,
  queryBuilderHeader,
  restore,
} from "e2e/support/helpers";

describe("issue 30165", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  });

  it("should not autorun native queries after updating a question (metabase#30165)", () => {
    openNativeEditor();
    cy.findByTestId("native-query-editor").type("SELECT * FROM ORDERS");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("Q1");
      cy.findByText("Save").click();
    });
    cy.wait("@createQuestion");
    cy.button("Not now").click();

    cy.findByTestId("native-query-editor").type(" WHERE TOTAL < 20");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.findByTestId("native-query-editor").type(" LIMIT 10");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.get("@dataset.all").should("have.length", 0);
    cy.get("@cardQuery.all").should("have.length", 0);
    cy.findByTestId("query-builder-main")
      .findByText("Here's where your results will appear")
      .should("be.visible");
  });
});
