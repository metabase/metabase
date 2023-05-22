import {
  restore,
  openProductsTable,
  popover,
  sidebar,
  editDashboard,
  saveDashboard,
  visitDashboard,
  getFullName,
  openQuestionsSidebar,
} from "e2e/support/helpers";

import { USERS } from "e2e/support/cypress_data";

const { normal } = USERS;

describe("metabase > scenarios > home > activity-page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show test startup activity ", () => {
    cy.visit("/activity");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Activity");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase is up and running.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("added a question to the dashboard - Orders in a dashboard");
  });

  it("should show new activity", () => {
    cy.signInAsNormalUser();

    // Make and a save new question
    openProductsTable();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Enter a number").type("5");
      cy.findByText("Add filter").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.get("[value='Products, Filtered by Rating equals 5']");
    cy.findAllByText("Save").last().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    // View a dashboard
    cy.visit("/collection/root?type=dashboard");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("My personal collection").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    cy.get(".Card").should("have.length", 1);

    // See activity on activity page
    cy.signInAsAdmin();
    cy.visit("/activity");

    cy.findAllByText("joined!").should("have.length", 2);
    cy.findAllByText(getFullName(normal)).should("have.length", 2);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products, Filtered by Rating equals 5");
  });

  it("should respect the (added to dashboard) card id in the link (metabase#18547)", () => {
    cy.intercept("GET", `/api/dashboard/1`).as("dashboard");

    visitDashboard(1);
    cy.wait("@dashboard");

    editDashboard();
    openQuestionsSidebar();

    sidebar().within(() => {
      cy.findByTestId("loading-spinner").should("not.exist");
      cy.findByText("Orders").click();
    });

    saveDashboard();
    cy.wait("@dashboard");

    cy.visit("/activity");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("You added a question to the dashboard - Orders in a dashboard")
      .closest("li")
      .findByRole("link", { name: "Orders" })
      .should("have.attr", "href")
      .and("include", "question/1");
  });
});
