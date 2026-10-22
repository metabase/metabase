const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

describe("scenarios > models > create", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("creates a native query model", () => {
    const modelName = "m42";
    cy.intercept("POST", "/api/card").as("createModel");

    navigateToNewModelPage();

    // Cancel creation with confirmation modal
    cy.findByTestId("dataset-edit-bar").button("Cancel").click();
    H.modal().button("Discard changes").click();
    cy.location("pathname").should("eq", "/");

    // Now we will create a model from the browse page
    cy.visit("/browse/models");
    cy.findByLabelText("Create a new model").click();
    cy.findByTestId("new-model-options")
      .findByText("Use a native query")
      .click();

    // Clicking on metadata should not work until we run a query
    cy.findByTestId("editor-tabs-columns").should("be.disabled");

    H.NativeEditor.focus().type("select 42");

    cy.log("the editor should not overflow its container (metabase#69722)");
    H.NativeEditor.type("{enter}".repeat(20));
    cy.findByTestId("native-query-editor-container")
      .findByTestId("run-button")
      .should("be.visible");

    cy.findByTestId("native-query-editor-container")
      .findByLabelText("Get Answer")
      .click();
    cy.wait("@dataset");
    cy.findByTestId("visualization-root").should("contain", "42");

    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").type(modelName);
      cy.button("Save").click();
    });
    cy.wait("@createModel");

    // After saving, we land on view mode for the model
    cy.location("pathname").should("match", /^\/model\/\d+-.*$/);
    cy.findByTestId("question-row-count").should("have.text", "Showing 1 row");
  });

  // This covers creating a GUI model from the browse page + nocollection permissions (2 in 1)
  it("user without a collection access should still be able to create and save a model in his own personal collection, and one without native permissions cannot start a model", () => {
    cy.intercept("POST", "/api/card").as("createModel");

    cy.log(
      "a user without native permissions should not be able to initiate a new model creation",
    );
    cy.signIn("nosql");
    cy.visit("/browse/models");
    cy.findByTestId("browse-models-header").within(() => {
      cy.findByRole("heading").should("contain", "Models").and("be.visible");
      cy.findByLabelText("Create a new model").should("not.exist");
    });

    cy.signIn("nocollection");
    cy.visit("/browse/models");

    cy.findByLabelText("Create a new model").click();
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("People").click();
    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByTestId("save-question-modal")
      .should("contain", "Save model")
      .and("contain", H.getPersonalCollectionName(USERS["nocollection"]))
      .button("Save")
      .click();
    cy.wait("@createModel");
    cy.location("pathname").should("match", /^\/model\/\d+-.*$/);
  });
});

function navigateToNewModelPage(queryType = "native") {
  cy.visit("/model/new");
  if (queryType === "structured") {
    cy.findByText("Use the notebook editor").click();
  } else {
    cy.findByText("Use a native query").click();
  }
}
