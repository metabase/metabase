import {
  restore,
  editDashboard,
  saveDashboard,
  visitDashboard,
  setFilter,
  filterWidget,
  addTextBox,
  popover,
} from "__support__/e2e/helpers";

// Disabling for now as parameters in text cards
// are currently conflicting with writeback's own implementation
describe.skip("scenarios > dashboard > parameters in text cards", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
  });

  it("should show instructional text for text cards with no variables", () => {
    addTextBox("Text card with no variables", {
      parseSpecialCharSequences: false,
    });
    editDashboard();
    setFilter("Number", "Equal to");
    cy.findByText(
      "You can connect widgets to {{variables}} in text cards.",
    ).should("exist");
    cy.icon("info").should("exist");
  });

  it("should allow dashboard filters to be connected to tags in text cards", () => {
    addTextBox("Variable: {{foo}}", { parseSpecialCharSequences: false });
    editDashboard();
    setFilter("Number", "Equal to");

    cy.findByText("Select…").click();
    cy.findByText("foo").click();
    saveDashboard();

    filterWidget().click();
    cy.findByPlaceholderText("Enter a number").type(`1{enter}`);
    cy.button("Add filter").click();
    cy.findByText("Variable: 1").should("exist");

    cy.findByText("1").click();
    popover().within(() => {
      cy.findByRole("textbox")
        .click()
        .type("2{enter}");
      cy.button("Update filter").click();
    });
    cy.findByText("Variable: 1 and 2").should("exist");

    editDashboard();
    cy.findByText("Equal to").click();
    cy.findByText("foo").should("exist");
  });

  it("should translate parameter values into the instance language", () => {
    // Set user locale to English explicitly so that we can change the site locale separately, without the user
    // locale following it (by default, user locale matches site locale)
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    cy.request("PUT", `/api/setting/site-locale`, { value: "fr" });
    cy.reload();

    addTextBox("Variable: {{foo}}", { parseSpecialCharSequences: false });
    editDashboard();
    setFilter("Number", "Equal to");

    cy.findByText("Select…").click();
    cy.findByText("foo").click();
    saveDashboard();

    filterWidget().click();
    popover().within(() => {
      cy.findByRole("textbox").type(`1{enter}`);
      cy.findByRole("textbox")
        .click()
        .type("2{enter}");
      cy.button("Add filter").click();
    });

    cy.findByText("Variable: 1 et 2").should("exist");

    // Let's make sure the localization was reset back to the user locale by checking that specific text exists in
    // English on the homepage.
    cy.visit("/");
    cy.findByText("Pick up where you left off").should("exist");
  });
});
