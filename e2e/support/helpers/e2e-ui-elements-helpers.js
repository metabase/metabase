// various Metabase-specific "scoping" functions like inside popover/modal/navbar/main/sidebar content area
export const POPOVER_ELEMENT = ".popover[data-state~='visible']";

export function popover() {
  cy.get(POPOVER_ELEMENT).should("be.visible");
  return cy.get(POPOVER_ELEMENT);
}

export function modal() {
  return cy.get(".ModalContainer .ModalContent");
}

export function sidebar() {
  return cy.get("main aside");
}

export function appbar() {
  return cy.findByTestId("app-bar");
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
  return cy.get("#root header").first();
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

export const openQuestionActions = () => {
  cy.findByTestId("qb-header-action-panel").icon("ellipsis").click();
};

export const closeQuestionActions = () => {
  cy.findByTestId("qb-header").click();
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
