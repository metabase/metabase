import { restore, showDashboardCardActions } from "__support__/e2e/cypress";

function addTextBox(string) {
  cy.icon("pencil").click();
  cy.icon("string").click();
  cy.findByPlaceholderText("Write here, and use Markdown if you'd like").type(
    string,
  );
}

describe("scenarios > dashboard > text-box", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("Editing", () => {
    beforeEach(() => {
      // Create text box card
      cy.visit("/dashboard/1");
      addTextBox("Text *text* __text__");
    });

    it("should render correct icons for preview and edit modes", () => {
      showDashboardCardActions(1);

      // edit mode
      cy.icon("eye").click();

      // preview mode
      cy.icon("edit_document");
    });

    it("should not render edit and preview actions when not editing", () => {
      // Exit edit mode and check for edit options
      cy.findByText("Save").click();
      cy.findByText("You are editing a dashboard").should("not.exist");
      cy.contains("Text text text");
      cy.icon("edit_document").should("not.exist");
      cy.icon("eye").should("not.exist");
    });

    it("should switch between rendered markdown and textarea input", () => {
      cy.findByText("Text *text* __text__");
      cy.findByText("Save").click();
      cy.contains("Text text text");
    });
  });

  describe("when text-box is the only element on the dashboard", () => {
    beforeEach(() => {
      cy.server();
      cy.createDashboard("Test Dashboard");
    });

    // fixed in metabase#11358
    it("should load after save/refresh (metabase#12873)", () => {
      cy.visit(`/dashboard/2`);

      cy.findByText("Test Dashboard");
      cy.findByText("This dashboard is looking empty.");

      // Add save text box to dash
      addTextBox("Dashboard testing text");
      cy.findByText("Save").click();

      // Reload page
      cy.reload();

      // Page should still load
      cy.findByText("Ask a question");
      cy.findByText("Loading...").should("not.exist");
      cy.findByText("Cannot read property 'type' of undefined").should(
        "not.exist",
      );
      cy.findByText("Test Dashboard");

      // Text box should still load
      cy.findByText("Dashboard testing text");
    });

    it("should have a scroll bar for long text (metabase#8333)", () => {
      cy.intercept("PUT", "/api/dashboard/2").as("dashboardUpdated");

      cy.visit(`/dashboard/2`);

      addTextBox(
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      );
      cy.findByText("Save").click();

      cy.wait("@dashboardUpdated");

      // The test fails if there is no scroll bar
      cy.get(".text-card-markdown")
        .should("have.css", "overflow", "auto")
        .scrollTo("bottom");
    });
  });
});
