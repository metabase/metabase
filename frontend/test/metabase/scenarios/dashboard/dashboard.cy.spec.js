import { popover, restore, signInAsAdmin } from "__support__/cypress";
// Mostly ported from `dashboard.e2e.spec.js`
// *** Haven't ported: should add the parameter values to state tree for public dashboards

function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should create new dashboard", () => {
    // Create dashboard
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();
    cy.findByLabelText("Name").type("Test Dash");
    cy.findByLabelText("Description").type("Desc");
    cy.findByText("Create").click();
    cy.findByText("This dashboard is looking empty.");

    // See it as a listed dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("This dashboard is looking empty.").should("not.exist");
    cy.findByText("Test Dash");
  });

  it("should update title and description", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-ellipsis").click();
    cy.findByText("Change title and description").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Test Title");
    cy.findByLabelText("Description")
      .click()
      .clear()
      .type("Test description");

    cy.findByText("Update").click();
    cy.findByText("Test Title");
    cy.get(".Icon-info").click();
    cy.findByText("Test description");
  });

  it("should add a filter", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-filter").click();
    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    cy.findByText("Location").click();
    cy.findByText("State").click();
    cy.findByText("Select…").click();

    popover().within(() => {
      cy.findByText("State").click();
    });
    cy.get(".Icon-close");
    cy.get(".Button--primary")
      .contains("Done")
      .click();

    saveDashboard();

    cy.log("**Assert that the selected filter is present in the dashboard**");
    cy.get(".Icon-location");
    cy.findByText("State");
  });

  it("should add a question", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByText("Orders, Count");
  });

  it("should duplicate a dashboard", () => {
    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");
    cy.get(".Icon-ellipsis").click();
    cy.findByText("Duplicate").click();
    cy.findByLabelText("Name")
      .click()
      .clear()
      .type("Doppleganger");
    cy.get(".Button--primary")
      .contains("Duplicate")
      .click();

    cy.findByText("Orders in a dashboard").should("not.exist");
    cy.findByText("Doppleganger");
  });

  describe("revisions screen", () => {
    it("should open and close", () => {
      cy.visit("/dashboard/1");
      cy.get(".Icon-ellipsis").click();
      cy.findByText("Revision history").click();

      cy.findByText("What");
      cy.findByText("First revision.");

      cy.get(".Modal .Icon-close").click();
      cy.findByText("First revision.").should("not.exist");
    });

    it("should open with url", () => {
      cy.visit("/dashboard/1/history");

      cy.findByText("Revision history");
      cy.findByText("What");
      cy.findByText("First revision.");
    });
  });
});
