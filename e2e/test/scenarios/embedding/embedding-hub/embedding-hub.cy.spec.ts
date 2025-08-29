const { H } = cy;

describe("scenarios - embedding hub", () => {
  describe("checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
    });

    it('"Create a dashboard" step should work correctly', () => {
      cy.visit("/embedding-hub");

      cy.log("Check that it's not set as completed by default");
      cy.findByRole("button", { name: /create a dashboard/i }).should(
        "have.attr",
        "aria-label",
        "Create a dashboard",
      );

      cy.log("Generate a dashboard via x-ray");
      cy.findByRole("button", { name: /create a dashboard/i })
        .scrollIntoView()
        .click();

      H.main().findByText("Generate automatic dashboard").click();
      H.modal().findByText("Accounts").click();
      cy.wait(1000); // TODO: fix this, I think the button is clickable before it actually work
      H.main().findByText("Save this").click();

      H.undoToast().findByRole("link", { name: "See it" }).should("be.visible");

      cy.visit("/embedding-hub");

      cy.log("Check that's it's marked as completed");
      cy.findByRole("button", { name: /create a dashboard/i }).should(
        "have.attr",
        "aria-label",
        "Create a dashboard Done",
      );
    });

    it('"Add your data" step should work correctly', () => {
      cy.visit("/embedding-hub");

      cy.log("Check that it's not set as completed by default");
      cy.findByRole("button", { name: /add your data/i })
        .scrollIntoView()
        .should("have.attr", "aria-label", "Add your data")
        .click();

      cy.log("Add a QA Postgres database via API");
      H.addPostgresDatabase("Test QA Database");

      cy.log("Refresh the page and check that the step is marked as completed");
      cy.visit("/embedding-hub");
      cy.findByRole("button", { name: /add your data/i }).should(
        "have.attr",
        "aria-label",
        "Add your data Done",
      );
    });
  });
});
