import { restore, sidebar, visualize } from "__support__/e2e/cypress";

import {
  openDetailsSidebar,
  startQuestionFromModel,
} from "./helpers/e2e-models-helpers";

import {
  openColumnOptions,
  renameColumn,
  setColumnType,
  mapColumnTo,
} from "./helpers/e2e-models-metadata-helpers";

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
