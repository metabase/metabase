import { restore } from "e2e/support/helpers";

describe("scenarios > admin > performance", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "/api/cache").as("cache");
    cy.intercept("POST", "/api/persist/enable").as("enablePersistence");
    cy.intercept("POST", "/api/persist/disable").as("disablePersistence");
    cy.signInAsAdmin();

    cy.visit("/admin");
    cy.findByRole("link", { name: "Performance" }).click();
  });

  it("can enable and disable model persistence", () => {
    cy.findByRole("tab", { name: "Model persistence" }).click();
    cy.findByRole("checkbox", { name: "Disabled" }).next("label").click();
    cy.wait("@enablePersistence");
    cy.findByTestId("toast-undo").contains("Saved");
    cy.findByTestId("toast-undo")
      .findByRole("img", { name: /close icon/ })
      .click();

    cy.findByRole("checkbox", { name: "Enabled" }).next("label").click();
    cy.wait("@disablePersistence");
    cy.findByTestId("toast-undo").contains("Saved");
  });

  it("can change when models are refreshed", () => {
    cy.findByRole("tab", { name: "Model persistence" }).click();
    cy.findByRole("checkbox", { name: "Disabled" }).next("label").click();
    cy.wait("@enablePersistence");
    cy.findByTestId("toast-undo").contains("Saved");
    cy.findByTestId("toast-undo")
      .findByRole("img", { name: /close icon/ })
      .click();
    cy.findByRole("combobox").click();
    cy.findByRole("listbox").findByText("2 hours").click();
    cy.findByTestId("toast-undo").contains("Saved");
  });
});
