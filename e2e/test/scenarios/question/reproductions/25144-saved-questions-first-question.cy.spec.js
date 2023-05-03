import { modal, popover, restore } from "e2e/support/helpers";

describe("issue 25144", () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/card`).as("createCard");
    cy.intercept("PUT", `/api/card/*`).as("updateCard");
  });

  it("should show Saved Questions section after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders question");
    modal().button("Save").click();
    cy.wait("@createCard");
    modal().button("Not now").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Saved Questions").click();
    popover().findByText("Orders question").should("be.visible");
  });

  it("should show Models section after creation the first model (metabase#24878)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders model");
    modal().button("Save").click();
    cy.wait("@createCard");
    modal().button("Not now").click();

    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Turn into a model").click();
    modal().button("Turn this into a model").click();
    cy.wait("@updateCard");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Models").click();
    popover().findByText("Orders model").should("be.visible");
  });
});
