import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  editDashboard,
  saveDashboard,
  visitDashboard,
  getDashboardCard,
  setFilter,
  filterWidget,
  addTextBoxWhileEditing,
  addHeadingWhileEditing,
  popover,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > parameters in text and heading cards", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
  });

  it("should allow dashboard filters to be connected to tags in text cards", () => {
    editDashboard();

    addTextBoxWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    addHeadingWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });

    setFilter("Number", "Equal to");

    getDashboardCard(0).findByText("Select…").click();
    popover().findByText("foo").click();

    getDashboardCard(1).findByText("Select…").click();
    popover().findByText("foo").click();

    saveDashboard();

    filterWidget().click();
    cy.findByPlaceholderText("Enter a number").type("1{enter}");
    cy.button("Add filter").click();
    getDashboardCard(0).findByText("Variable: 1").should("exist");
    getDashboardCard(1).findByText("Variable: 1").should("exist");

    cy.findByTestId("dashboard-parameters-widget-container")
      .findByText("1")
      .click();
    popover().within(() => {
      cy.findByRole("textbox").click().type("2{enter}");
      cy.button("Update filter").click();
    });
    getDashboardCard(0).findByText("Variable: 1 and 2").should("exist");
    getDashboardCard(1).findByText("Variable: 1 and 2").should("exist");

    editDashboard();

    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    getDashboardCard(0).findByText("foo").should("exist");
    getDashboardCard(1).findByText("foo").should("exist");
  });

  it("should not transform text variables to plain text (metabase#31626)", () => {
    editDashboard();

    const textContent = "Variable: {{foo}}";
    addTextBoxWhileEditing(textContent, { parseSpecialCharSequences: false });
    addHeadingWhileEditing(textContent, { parseSpecialCharSequences: false });

    setFilter("Number", "Equal to");

    getDashboardCard(0).findByText("Select…").click();
    popover().findByText("foo").click();

    getDashboardCard(1).findByText("Select…").click();
    popover().findByText("foo").click();

    saveDashboard();

    filterWidget().click();
    cy.findByPlaceholderText("Enter a number").type("1{enter}");
    cy.button("Add filter").click();

    // view mode
    getDashboardCard(0).findByText("Variable: 1").should("be.visible");
    getDashboardCard(1).findByText("Variable: 1").should("be.visible");

    editDashboard();

    getDashboardCard(0).findByText(textContent).should("be.visible");
    getDashboardCard(1).findByText(textContent).should("be.visible");
  });

  it("should translate parameter values into the instance language", () => {
    // Set user locale to English explicitly so that we can change the site locale separately, without the user
    // locale following it (by default, user locale matches site locale)
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    cy.request("PUT", "/api/setting/site-locale", { value: "fr" });
    cy.reload();

    editDashboard();

    addTextBoxWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    addHeadingWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    setFilter("Time", "Relative Date");

    getDashboardCard(0).findByText("Select…").click();
    popover().findByText("foo").click();

    getDashboardCard(1).findByText("Select…").click();
    popover().findByText("foo").click();

    saveDashboard();

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Today").click();
    });

    getDashboardCard(0).findByText("Variable: Aujourd'hui").should("exist");
    getDashboardCard(1).findByText("Variable: Aujourd'hui").should("exist");

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
    cy.request("PUT", "/api/setting/site-locale", { value: "fr" });

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

      editDashboard();

      // Create text card and connect parameter
      addTextBoxWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });
      addHeadingWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();

      getDashboardCard(0).findByText("Select…").click();
      popover().findByText("Created At").click();

      getDashboardCard(1).findByText("Select…").click();
      popover().findByText("foo").click();

      getDashboardCard(2).findByText("Select…").click();
      popover().findByText("foo").click();

      saveDashboard();

      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();
      popover().within(() => {
        cy.findByRole("textbox").click().clear().type("07/19/2023").blur();
        cy.button("Add filter").click();
      });

      // Question should be filtered appropriately
      getDashboardCard(0).within(() => {
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Small Marble Shoes").should("not.exist");
      });

      // Parameter value in widget should use user localization (English)
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("July 19, 2023")
        .should("exist");

      // Parameter value in dashboard should use site localization (French)
      getDashboardCard(1)
        .findByText("Variable: juillet 19, 2023")
        .should("exist");
      getDashboardCard(2)
        .findByText("Variable: juillet 19, 2023")
        .should("exist");
    });
  });
});
