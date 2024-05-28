import {
  restore,
  runNativeQuery,
  focusNativeEditor,
} from "e2e/support/helpers";

describe("issue 30680", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not render native editor buttons when 'Metadata' tab is open", () => {
    cy.visit("/model/new");

    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    focusNativeEditor().type("select * from orders ", { delay: 100 });
    runNativeQuery();

    cy.findByTestId("editor-tabs-metadata-name").click();

    cy.findByTestId("native-query-editor-sidebar").should("not.exist");
  });
});
