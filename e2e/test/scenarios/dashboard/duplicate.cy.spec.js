import { restore, visitCollection, visitDashboard } from "e2e/support/helpers";

describe("scenarios > dashboard > duplicate", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shallow (duplicate dashboard but not its cards)", () => {
    visitDashboard(1);

    cy.get("main header").within(() => {
      cy.icon("ellipsis").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Duplicate").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText('Duplicate "Orders in a dashboard" and its questions');

    cy.findByRole("checkbox").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText('Duplicate "Orders in a dashboard"');

    cy.button("Duplicate").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard - Duplicate");
  });

  it("deep (duplicate dashboard and its card)", () => {
    visitDashboard(1);

    cy.get("main header").within(() => {
      cy.icon("ellipsis").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Duplicate").click();

    // Change destination collection
    cy.findByTestId("select-button").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("My personal collection").click();

    cy.button("Duplicate").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard - Duplicate");

    // Duplicated dashboard and question should live in personal collection
    visitCollection(1);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard - Duplicate");
  });
});
