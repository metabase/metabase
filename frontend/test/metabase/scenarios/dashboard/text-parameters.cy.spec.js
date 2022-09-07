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
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > parameters in text cards", () => {
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
      cy.findByRole("textbox").click().type("2{enter}");
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
    setFilter("Time", "Relative Date");

    cy.findByText("Select…").click();
    cy.findByText("foo").click();
    saveDashboard();

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Today").click();
    });

    cy.findByText("Variable: Aujourd'hui").should("exist");

    // Let's make sure the localization was reset back to the user locale by checking that specific text exists in
    // English on the homepage.
    cy.visit("/");
    cy.findByText("Pick up where you left off").should("exist");
  });

  it("should localize date parameters in the instance locale", () => {
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    cy.request("PUT", `/api/setting/site-locale`, { value: "fr" });

    // Create dashboard with a single date parameter, and a single question
    cy.createQuestionAndDashboard({
      questionDetails: { query: { "source-table": PRODUCTS_ID } },
    }).then(({ body: card }) => {
      const { dashboard_id } = card;
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          {
            name: "Single Date",
            slug: "single_date",
            id: "ad1c877e",
            type: "date/single",
          },
        ],
      });
      const updatedSize = {
        size_x: 8,
        size_y: 6,
      };
      cy.editDashboardCard(card, updatedSize);
      visitDashboard(dashboard_id);

      // Connect parameter to question
      editDashboard();
      cy.findByText("Single Date").click();
      cy.findByText("Select…").click();
      cy.findByText("Created At").click();
      cy.findByText("Single Date").click();

      // Create text card and connect parameter
      addTextBox("Variable: {{foo}}", { parseSpecialCharSequences: false });
      cy.findByText("Single Date").click();
      cy.findByText("Select…").click();
      cy.findByText("foo").click();
      saveDashboard();

      cy.findByText("Single Date").click();
      popover().within(() => {
        cy.findByRole("textbox").click().clear().type("07/19/2017").blur();
        cy.button("Update filter").click();
      });

      // Question should be filtered appropriately
      cy.findByText("Rustic Paper Wallet").should("exist");
      cy.findByText("Small Marble Shoes").should("not.exist");

      // Parameter value in widget should use user localization (English)
      cy.findByText("July 19, 2017").should("exist");

      // Parameter value in dashboard should use site localization (French)
      cy.findByText("Variable: juillet 19, 2017").should("exist");
    });
  });
});
