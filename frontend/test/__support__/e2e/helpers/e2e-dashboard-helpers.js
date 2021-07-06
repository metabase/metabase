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
