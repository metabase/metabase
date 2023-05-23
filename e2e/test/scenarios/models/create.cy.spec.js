import {
  getCollectionIdFromSlug,
  modal,
  popover,
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Cancel").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discard").click();

    // Now we will create a model
    navigateToNewModelPage();

    // Clicking on metadata should not work until we run a query
    cy.findByTestId("editor-tabs-metadata").should("be.disabled");

    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByPlaceholderText("What is the name of your model?").type(modelName);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    // After saving, we land on view mode for the model
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize");

    checkIfPinned();
  });

  it("suggest the currently viewed collection when saving a new native query", () => {
    getCollectionIdFromSlug("third_collection", THIRD_COLLECTION_ID => {
      visitCollection(THIRD_COLLECTION_ID);
    });

    navigateToNewModelPage();
    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    cy.findByTestId("edit-bar").within(() => {
      cy.contains("button", "Save").click();
    });
    modal().within(() => {
      cy.findByTestId("select-button").should("have.text", "Third collection");
    });
  });

  it("suggest the currently viewed collection when saving a new structured query", () => {
    getCollectionIdFromSlug("third_collection", THIRD_COLLECTION_ID => {
      visitCollection(THIRD_COLLECTION_ID);
    });

    navigateToNewModelPage("structured");

    popover().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("edit-bar").within(() => {
      cy.contains("button", "Save").click();
    });

    modal().within(() => {
      cy.findByTestId("select-button").should("have.text", "Third collection");
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
