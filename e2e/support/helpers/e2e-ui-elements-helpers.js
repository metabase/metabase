// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
export const POPOVER_ELEMENT =
  ".popover[data-state~='visible'],[role='dialog'][tabindex='-1']";

export function popover() {
  cy.get(POPOVER_ELEMENT).should("be.visible");
  return cy.get(POPOVER_ELEMENT);
}

export function main() {
  return cy.get("main");
}

export function menu() {
  return cy.findByRole("menu");
}

export function modal() {
  return cy.get(".ModalContainer .ModalContent");
}

export function sidebar() {
  return cy.get("main aside");
}

export function rightSidebar() {
  return cy.findAllByTestId("sidebar-right");
}

export function leftSidebar() {
  return cy.findByTestId("sidebar-left");
}

export function navigationSidebar() {
  return cy.get("#root aside").first();
}

export function appBar() {
  return cy.findByLabelText("Navigation bar");
}

export function openNavigationSidebar() {
  appBar().findByTestId("sidebar-toggle").click();
}

export function closeNavigationSidebar() {
  appBar().findByTestId("sidebar-toggle").click();
}

export function browse() {
  // takes you to `/browse` (reflecting changes made in `0.38-collection-redesign)
  return navigationSidebar().findByText("Browse data");
}

/**
 * Get the `fieldset` HTML element that we use as a filter widget container.
 *
 * @returns HTMLFieldSetElement
 *
 * @example
 * // Simple SQL filter widget (works for "Text" and "Number" SQL variable types)
 * filterWidget().type("123");
 *
 * @example
 * // Filter widget that opens some other type of a filter picker (search, dropdown, input)
 * filterWidget()
 *  .contains("Search")
 *  .click();
 *
 * @todo Add the ability to choose between multiple widgets using their index.
 * @todo Add the ability to alias the chosen filter widget.
 * @todo Extract into a separate helper file.
 */
export function filterWidget() {
  return cy.get("fieldset");
}

export function clearFilterWidget(index = 0) {
  return filterWidget().eq(index).icon("close").click();
}

export const openQuestionActions = () => {
  cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
};

export const collectionTable = () => {
  return cy.findByTestId("collection-table");
};

export const queryBuilderHeader = () => {
  return cy.findByTestId("qb-header");
};

export const closeQuestionActions = () => {
  queryBuilderHeader().click();
};

export const questionInfoButton = () => {
  return cy.findByTestId("qb-header-info-button");
};

export const undo = () => {
  cy.findByTestId("toast-undo").findByText("Undo").click();
};

export const getDraggableElements = () => {
  return cy.findAllByTestId(/draggable-item/);
};

export const moveColumnDown = (column, distance) => {
  column
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", 5, 5, { force: true })
    .trigger("mousemove", 0, distance * 50, { force: true })
    .trigger("mouseup", 0, distance * 50, { force: true });
};

export const queryBuilderMain = () => {
  return cy.findByTestId("query-builder-main");
};

export const dashboardParametersContainer = () => {
  return cy.findByTestId("dashboard-parameters-widget-container");
};

export const undoToast = () => {
  return cy.findByTestId("toast-undo");
};

export function dashboardCards() {
  return cy.get("#Dashboard-Cards-Container");
}
