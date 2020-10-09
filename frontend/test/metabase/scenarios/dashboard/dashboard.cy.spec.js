import { restore, signInAsAdmin } from "../../../__support__/cypress";
// Mostly ported from `dashboard.e2e.spec.js`
// *** Haven't ported: should add the parameter values to state tree for public dashboards

function saveDashboard() {
  cy.findByText("Save").click({ force: true });
  cy.findByText("Saving…");
  cy.findByText("Saving…").should("not.exist");
}

// TODO @nemanjaglumac
// [quarantine]: outdated (icon names, UI), breaking changes
describe.skip("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should create new dashboard", () => {
    // Create dashboard
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();
    cy.findByPlaceholderText("What is the name of your dashboard?").type(
      "Test Dashboard",
    );
    cy.findByPlaceholderText("It's optional but oh, so helpful").type(
      "Test description for dashboard.",
    );
    cy.findByText("Create").click();
    cy.findByText("This dashboard is looking empty.");

    // See it as a listed dashboard
    cy.visit("/collection/root?type=dashboard");
    cy.findByText("This dashboard is looking empty.").should("not.exist");
    cy.findByText("Test Dashboard");
  });

  it("should change title and description", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get("input[value='Orders in a dashboard']")
      .clear()
      .type("Test Title");
    cy.findByPlaceholderText("No description yet")
      .clear()
      .type("Test description");

    cy.findByText("Save").click();
    cy.findByText("Test Title");
    cy.get(".Icon-info").click();
    cy.findByText("Test description");
  });

  it("should add a filter", () => {
    cy.visit("/dashboard/1");
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-funnel_add").click();
    cy.findByText("Location").click();
    cy.findByText("State").click();
    cy.findByText("Select…").click();
    cy.get(".PopoverContainer .cursor-pointer").click({ force: true });
    cy.get(".Icon-close");
    cy.findByText("Done").click();
    saveDashboard();

    cy.get(".DashCard").click();
  });

  it("should add a question", () => {
    cy.visit("/dashboard/1");
    cy.get(".QueryBuilder-section .Icon-add").click();
    cy.findByText("Orders, Count").click();
    saveDashboard();

    cy.findByText("Orders, Count");
  });

  it("should duplicate a dashboard", () => {
    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");
    cy.get(".Icon-clone").click();
    cy.findByPlaceholderText("What is the name of your dashboard?")
      .clear()
      .type("Duplicate Dashboard");
    cy.findByText("Duplicate").click();

    cy.findByText("Orders in a dashboard").should("not.exist");
    cy.findByText("Duplicate Dashboard");
  });

  describe("revisions screen", () => {
    it("should open and close", () => {
      // open
      cy.visit("/dashboard/1");
      cy.get(".Icon-pencil").click();
      cy.get(".Icon-history").click();

      cy.findAllByText("Revision history");
      cy.findByText("When");
      cy.contains("Today");

      // close
      cy.get(".ModalContent .Icon-close").click();
      cy.findByText("Revision history").should("not.exist");
    });

    it("should open with url", () => {
      cy.visit("/dashboard/1/history");
      cy.findAllByText("Revision history");
    });
  });
});
