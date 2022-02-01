//Replaces HomepageApp.e2e.spec.js
import {
  restore,
  openProductsTable,
  popover,
  sidebar,
  editDashboard,
  saveDashboard,
} from "__support__/e2e/cypress";

describe("metabase > scenarios > home > activity-page", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show test startup activity ", () => {
    cy.visit("/activity");
    cy.findByText("Activity");
    cy.findByText("Metabase is up and running.");
    cy.contains("added a question to the dashboard - Orders in a dashboard");
  });

  it("should show new activity", () => {
    cy.signInAsNormalUser();

    // Make and a save new question
    openProductsTable();
    cy.findByText("Rating").click();
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Enter a number").type("5");
      cy.findByText("Update filter").click();
    });
    cy.findByText("Save").click();
    cy.get("[value='Products, Filtered by Rating']");
    cy.findAllByText("Save").last().click();
    cy.findByText("Not now").click();

    // View a dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("Orders in a dashboard").click();
    cy.findByText("My personal collection").should("not.exist");
    cy.findByText("Orders");
    cy.get(".Card").should("have.length", 1);

    // See activity on activity page
    cy.signInAsAdmin();
    cy.visit("/activity");

    cy.findAllByText("joined!").should("have.length", 2);
    cy.findAllByText("Robert").should("have.length", 2);
    cy.findByText("Products, Filtered by Rating");
  });

  it("should respect the (added to dashboard) card id in the link (metabase#18547)", () => {
    cy.intercept("GET", `/api/dashboard/1`).as("dashboard");

    cy.visit("/dashboard/1");
    cy.wait("@dashboard");

    editDashboard();

    cy.icon("add").last().click();

    sidebar().within(() => {
      cy.findByTestId("loading-spinner").should("not.exist");
      cy.findByText("Orders").click();
    });

    saveDashboard();
    cy.wait("@dashboard");

    cy.visit("/activity");

    cy.contains("You added a question to the dashboard - Orders in a dashboard")
      .closest("li")
      .findByRole("link", { name: "Orders" })
      .should("have.attr", "href")
      .and("include", "question/1");
  });
});
