import { popover } from "./e2e-ui-elements-helpers";

// Metabase utility functions for commonly-used patterns
export function selectDashboardFilter(selection, filterName) {
  selection.contains("Select…").click();
  popover().contains(filterName).click({ force: true });
}

export function getDashboardCard(index = 0) {
  return cy.get(".DashCard").eq(index);
}

export function showDashboardCardActions(index = 0) {
  getDashboardCard(index).realHover();
}

export function editDashboard() {
  cy.icon("pencil").click();
  cy.findByText("You're editing this dashboard.");
}

export function saveDashboard({
  buttonLabel = "Save",
  editBarText = "You're editing this dashboard.",
} = {}) {
  cy.findByText(buttonLabel).click();
  cy.findByText(editBarText).should("not.exist");
  cy.wait(1); // this is stupid but necessary to due to the dashboard resizing and detaching elements
}

export function checkFilterLabelAndValue(label, value) {
  cy.get("fieldset").find("legend").invoke("text").should("eq", label);

  cy.get("fieldset").contains(value);
}

export function setFilter(type, subType) {
  cy.icon("filter").click();

  cy.findByText("What do you want to filter?");

  popover().within(() => {
    cy.findByText(type).click();

    if (subType) {
      cy.findByText(subType).click();
    }
  });
}

export function addTextBox(string, options = {}) {
  cy.icon("pencil").click();
  cy.icon("string").click();
  cy.findByPlaceholderText(
    "You can use Markdown here, and include variables {{like_this}}",
  ).type(string, options);
}
