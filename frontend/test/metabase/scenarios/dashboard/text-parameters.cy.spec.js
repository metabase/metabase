import {
  restore,
  editDashboard,
  saveDashboard,
  visitDashboard,
  setFilter,
  filterWidget,
  addTextBox,
} from "__support__/e2e/helpers";

import { addWidgetNumberFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

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
    addWidgetNumberFilter(1);
    cy.findByText("Variable: 1").should("exist");
  });
});
