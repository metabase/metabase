import { restore, sidebar, popover, visualize } from "__support__/e2e/cypress";

import { openDetailsSidebar } from "./helpers/e2e-models-helpers";

describe("scenarios > models metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should edit GUI model metadata", () => {
    // Convert saved question "Orders" into a model
    cy.request("PUT", "/api/card/1", {
      name: "GUI Model",
      dataset: true,
    });

    cy.visit("/model/1");

    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByTestId("tooltip-component-wrapper").realHover();
      cy.findByText("89%");
    });

    cy.findByText(
      "Some columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();
    cy.url().should("include", "/metadata");

    openColumnOptions("Subtotal");

    renameColumn("Subtotal", "Pre-tax");
    setColumnType("No special type", "Cost");

    startQuestionFromModel("GUI Model");

    visualize();
    cy.findByText("Pre-tax ($)");
  });

  it("should edit native model metadata", () => {
    cy.createNativeQuestion({
      name: "Native Model",
      native: {
        query: "SELECT * FROM ORDERS",
      },
    }).then(({ body: { id: nativeModelId } }) => {
      cy.request("PUT", `/api/card/${nativeModelId}`, { dataset: true });

      cy.visit(`/model/${nativeModelId}`);
    });

    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByTestId("tooltip-component-wrapper").realHover();
      cy.findByText("37%");
    });

    cy.findByText(
      "Most columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();
    cy.url().should("include", "/metadata");

    openColumnOptions("SUBTOTAL");

    mapColumnTo({ table: "Orders", column: "Subtotal" });

    renameColumn("Subtotal", "Pre-tax");

    setColumnType("No special type", "Cost");

    startQuestionFromModel("Native Model");

    visualize();
    cy.findByText("Pre-tax ($)");
  });
});

function openColumnOptions(column) {
  cy.findByText(column).click();
}

function renameColumn(oldName, newName) {
  cy.findByDisplayValue(oldName)
    .clear()
    .type(newName);
}

function setColumnType(oldType, newType) {
  cy.findByText(oldType).click();
  cy.get(".ReactVirtualized__Grid.MB-Select").scrollTo("top");
  cy.findByPlaceholderText("Search for a special type").type(newType);

  cy.findByText(newType).click();
  cy.button("Save changes").click();
}

function mapColumnTo({ table, column } = {}) {
  cy.findByText("Database column this maps to")
    .closest(".Form-field")
    .find(".AdminSelect")
    .click();

  popover()
    .contains(table)
    .click();

  popover()
    .contains(column)
    .click();
}

function startQuestionFromModel(modelName) {
  cy.findByText("New").click();
  cy.findByText("Question")
    .should("be.visible")
    .click();
  cy.findByText("Models").click();
  cy.findByText(modelName).click();
}
