import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

describe("issue 17712", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("doesn't remove extra sections when removing a single section (metabase#17712)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.findByText("Join data").click();
    popover().findByText("Products").click();
    cy.findByTestId("step-join-0-0")
      .findByTestId("parent-dimension")
      .within(() => {
        cy.icon("close").click();
      });

    cy.findByTestId("action-buttons").findByText("Join data").click();
    popover().findByText("Reviews").click();

    cy.findByTestId("step-join-0-1").within(() => {
      cy.icon("close").click({ force: true });
    });

    cy.findByTestId("step-join-0-0").within(() => {
      cy.findByText("Orders");
      cy.findAllByText("Products");
      cy.findByText("ID");
    });
  });
});
