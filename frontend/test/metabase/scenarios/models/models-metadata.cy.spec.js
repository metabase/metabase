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
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
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
      cy.findByText("87%");
    });

    cy.findByText(
      "Some columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.url().should("include", "/metadata");
    cy.findByTextEnsureVisible("Product ID");

    openColumnOptions("Subtotal");

    renameColumn("Subtotal", "Pre-tax");
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    startQuestionFromModel("GUI Model");

    visualize();
    cy.findByText("Pre-tax ($)");
  });

  it("should edit native model metadata", () => {
    cy.createNativeQuestion(
      {
        name: "Native Model",
        dataset: true,
        native: {
          query: "SELECT * FROM ORDERS",
        },
      },
      { visitQuestion: true },
    );

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

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.url().should("include", "/metadata");
    cy.findByTextEnsureVisible("PRODUCT_ID");

    openColumnOptions("SUBTOTAL");

    mapColumnTo({ table: "Orders", column: "Subtotal" });

    renameColumn("Subtotal", "Pre-tax");

    setColumnType("No special type", "Cost");

    cy.button("Save changes").click();

    startQuestionFromModel("Native Model");

    visualize();
    cy.findByText("Pre-tax ($)");
  });

  it("should allow reverting to a specific metadata revision", () => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    cy.createNativeQuestion({
      name: "Native Model",
      dataset: true,
      native: {
        query: "SELECT * FROM ORDERS",
      },
    }).then(({ body: { id: nativeModelId } }) => {
      cy.visit(`/model/${nativeModelId}/metadata`);
      cy.wait("@cardQuery");
      cy.findByTextEnsureVisible("PRODUCT_ID");
    });

    openColumnOptions("SUBTOTAL");
    mapColumnTo({ table: "Orders", column: "Subtotal" });
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    // Revision 1
    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)").should("not.exist");
    openDetailsSidebar();
    cy.findByText("Customize metadata").click();

    cy.wait(["@cardQuery", "@cardQuery"]);
    cy.findByTextEnsureVisible("TAX");

    // Revision 2
    openColumnOptions("TAX");
    mapColumnTo({ table: "Orders", column: "Tax" });
    setColumnType("No special type", "Cost");
    cy.button("Save changes").click();

    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)");

    cy.reload();
    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByText("History").click();
      cy.findAllByText("Revert")
        .first()
        .click();
    });

    cy.wait("@revert");
    cy.findByText("Subtotal ($)");
    cy.findByText("Tax ($)").should("not.exist");
    cy.findByText("TAX");
  });
});
