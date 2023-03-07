import { restore, visitCollection } from "e2e/support/helpers";

const modelName = "A name";

describe("scenarios > models > create", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("creates a native query model via the New button", () => {
    cy.visit("/");

    goFromHomePageToNewNativeQueryModelPage();

    // Cancel creation with confirmation modal
    cy.findByText("Cancel").click();
    cy.findByText("Discard").click();

    // Now we will create a model
    goFromHomePageToNewNativeQueryModelPage();

    // Clicking on metadata should not work until we run a query
    cy.findByTestId("editor-tabs-metadata").should("be.disabled");

    cy.get(".ace_editor").should("be.visible").type("select * from ORDERS");

    cy.findByText("Save").click();

    cy.findByPlaceholderText("What is the name of your model?").type(modelName);

    cy.findByText("Save").click();

    // After saving, we land on view mode for the model
    cy.findByText("Summarize");

    checkIfPinned();
  });
});

function goFromHomePageToNewNativeQueryModelPage() {
  cy.findByText("New").click();
  cy.findByText("Model").click();
  cy.findByText("Use a native query").click();
}

function checkIfPinned() {
  visitCollection("root");

  cy.findByText(modelName)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });

  cy.findByText("Unpin").should("be.visible");
}
