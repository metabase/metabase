import { signInAsAdmin, restore } from "__support__/cypress";

describe("scenarios > dashboard > text-box", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it.skip("should load text box card (Issue #12914)", () => {
    // Create dashboard
    cy.server();
    cy.request("POST", "/api/dashboard", {
      name: "Test Dashboard",
    });
    cy.visit(`/dashboard/2`);

    cy.findByText("Test Dashboard");
    cy.findByText("This dashboard is looking empty.");

    // Add text box to dash
    cy.get(".Icon-pencil").click();
    cy.get(".Icon-string").click();
    cy.findByPlaceholderText("Write here, and use Markdown if you'd like").type(
      "Dashboard testing text",
    );
    cy.findByText("Save").click();

    cy.findByText("Saving…");
    cy.findByText("Saving…").should("not.exist");

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
});
