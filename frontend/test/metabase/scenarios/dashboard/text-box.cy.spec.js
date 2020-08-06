import { signInAsAdmin, restore } from "__support__/cypress";

function addTextBox(string) {
  cy.get(".Icon-pencil").click();
  cy.get(".Icon-string").click();
  cy.findByPlaceholderText("Write here, and use Markdown if you'd like").type(
    string,
  );
}

describe("scenarios > dashboard > text-box", () => {
  describe("when text-box is the only element on the dashboard", () => {
    beforeEach(() => {
      restore(); // restore before each so we can reuse dashboard id
      signInAsAdmin();
      // Create dashboard
      cy.server();
      cy.request("POST", "/api/dashboard", {
        name: "Test Dashboard",
      });
    });

    it("should load after save/refresh (Issue #12914)", () => {
      cy.visit(`/dashboard/2`);

      cy.findByText("Test Dashboard");
      cy.findByText("This dashboard is looking empty.");

      // Add save text box to dash
      addTextBox("Dashboard testing text");
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

    it.skip("should have a scroll bar for long text (Issue #8333)", () => {
      cy.visit(`/dashboard/2`);

      // Add text box to dash
      addTextBox(
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      );
      cy.findByText("Save").click();
      cy.get(".CardVisualization").scrollTo("bottom");
      cy.findByText("ex ea commodo consequat.");
      cy.findByText("Lorem ipsum dolor sit amet").should("not.exist");
    });
  });
});
