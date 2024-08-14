import { THIRD_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  entityPickerModal,
  entityPickerModalTab,
  modal,
  restore,
  visitCollection,
} from "e2e/support/helpers";

const modelName = "A name";

describe("scenarios > models > create", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("creates a native query model via the New button", () => {
    cy.visit("/");

    navigateToNewModelPage();

    // Cancel creation with confirmation modal
    cy.findByTestId("dataset-edit-bar").button("Cancel").click();
    modal().button("Discard changes").click();

    // Now we will create a model
    navigateToNewModelPage();

    // Clicking on metadata should not work until we run a query
    cy.findByTestId("editor-tabs-metadata").should("be.disabled");

    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").button("Save").click();
    cy.findByPlaceholderText("What is the name of your model?").type(modelName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // After saving, we land on view mode for the model
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize");

    checkIfPinned();
  });

  it("suggest the currently viewed collection when saving a new native query", () => {
    visitCollection(THIRD_COLLECTION_ID);

    navigateToNewModelPage();
    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.contains("button", "Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Which collection should this go in/).should(
        "have.text",
        "Third collection",
      );
    });
  });

  it("suggest the currently viewed collection when saving a new structured query", () => {
    visitCollection(THIRD_COLLECTION_ID);

    navigateToNewModelPage("structured");

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("dataset-edit-bar").within(() => {
      cy.contains("button", "Save").click();
    });

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Which collection should this go in/).should(
        "have.text",
        "Third collection",
      );
    });
  });
});

function navigateToNewModelPage(queryType = "native") {
  cy.findByText("New").click();
  cy.findByText("Model").click();
  if (queryType === "structured") {
    cy.findByText("Use the notebook editor").click();
  } else {
    cy.findByText("Use a native query").click();
  }
}

function checkIfPinned() {
  visitCollection("root");

  cy.findByText(modelName)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });

  cy.findByText("Unpin").should("be.visible");
}
