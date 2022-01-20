import { restore, sidebar, popover, visualize } from "__support__/e2e/cypress";

import { openDetailsSidebar } from "./helpers/e2e-models-helpers";

describe("scenarios > models metadata", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Convert saved question "Orders" into a model
    cy.request("PUT", "/api/card/1", {
      name: "GUI Model",
      dataset: true,
    });
  });

  it("should edit GUI model metadata", () => {
    cy.visit("/model/1");
    openDetailsSidebar();

    sidebar().within(() => {
      cy.findByTestId("tooltip-component-wrapper").realHover();
      cy.findByText("78%");
    });

    cy.findByText(
      "Many columns are missing a column type, description, or friendly name.",
    );
    cy.findByText(
      "Adding metadata makes it easier for your team to explore this data.",
    );

    cy.findByText("Customize metadata").click();

    cy.url().should("include", "/metadata");

    cy.findByText("Subtotal").click();
    cy.findByLabelText("Display name")
      .clear()
      .type("Pre-tax");
    cy.findByText("No special type").click();
    cy.get(".ReactVirtualized__Grid.MB-Select").scrollTo("top");
    cy.findByPlaceholderText("Search for a special type").type("cost");

    cy.findByText("Cost").click();
    cy.button("Save changes").click();

    cy.findByText("New").click();
    cy.findByText("Question").click();
    cy.findByText("Models").click();
    cy.findByText("GUI Model").click();

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

    cy.findByText("SUBTOTAL").click();
    cy.findByText("None").click();
    popover()
      .contains("Orders")
      .click();
    popover()
      .contains("Subtotal")
      .click();

    cy.findByDisplayValue("Subtotal")
      .clear()
      .type("Pre-tax");

    cy.findByText("No special type").click();
    cy.get(".ReactVirtualized__Grid.MB-Select").scrollTo("top");
    cy.findByPlaceholderText("Search for a special type").type("cost");

    cy.findByText("Cost").click();

    cy.button("Save changes").click();

    cy.findByText("New").click();
    cy.findByText("Question").click();
    cy.findByText("Models").click();
    cy.findByText("Native Model").click();

    visualize();
    cy.findByText("Pre-tax ($)");
  });
});
