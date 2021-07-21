import { popover } from "./e2e-ui-elements-helpers";

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover()
    .contains(filterName)
    .click({ force: true });
}

export function showDashboardCardActions(index = 0) {
  cy.get(".DashCard")
    .eq(index)
    .realHover();
}

export function editDashboard() {
  cy.icon("pencil").click();
}

export function cancelEditingDashboard() {
  cy.findByText("Cancel").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

export function saveDashboard() {
  cy.findByText("Save").click();
  cy.findByText("You're editing this dashboard.").should("not.exist");
}

export function checkFilterLabelAndValue(label, value) {
  cy.get("fieldset")
    .find("legend")
    .invoke("text")
    .should("eq", label);

  cy.get("fieldset").contains(value);
}
