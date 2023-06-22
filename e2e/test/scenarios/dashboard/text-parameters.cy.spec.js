import {
  restore,
  editDashboard,
  saveDashboard,
  visitDashboard,
  setFilter,
  filterWidget,
  addTextBox,
  popover,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    setFilter("Number", "Equal to");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "You can connect widgets to {{variables}} in text cards.",
    ).should("exist");
    cy.icon("info").should("exist");
  });

  it("should allow dashboard filters to be connected to tags in text cards", () => {
    addTextBox("Variable: {{foo}}", { parseSpecialCharSequences: false });
    setFilter("Number", "Equal to");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("foo").click();
    saveDashboard();

    filterWidget().click();
    cy.findByPlaceholderText("Enter a number").type(`1{enter}`);
    cy.button("Add filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Variable: 1").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1").click();
    popover().within(() => {
      cy.findByRole("textbox").click().type("2{enter}");
      cy.button("Update filter").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Variable: 1 and 2").should("exist");

    editDashboard();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Equal to").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    setFilter("Time", "Relative Date");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("foo").click();
    saveDashboard();

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Today").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Variable: Aujourd'hui").should("exist");

    // Let's make sure the localization was reset back to the user locale by checking that specific text exists in
    // English on the homepage.
    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
        size_x: 11,
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
      cy.findByLabelText("Add a heading or text box").click();
      popover().within(() => {
        cy.findByText("Text").click();
      });
      cy.findByPlaceholderText(
        "You can use Markdown here, and include variables {{like_this}}",
      ).type("Variable: {{foo}}", { parseSpecialCharSequences: false });
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
