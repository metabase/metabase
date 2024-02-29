import { filterWidget, focusNativeEditor, popover } from "e2e/support/helpers";

// FILTER TYPES

/**
 * Opens popover with the list of possible SQL filter types to choose from.
 * It does so from the currently selected SQL filter type.
 *
 * @param {("Text"|"Number"|"Date"|"Field Filter")} filterType
 */
export function openTypePickerFromSelectedFilterType(filterType) {
  cy.findByTestId("variable-type-select").click();
}

/**
 * Opens popover with the list of possible SQL filter types to choose from.
 * It does so from the default SQL filter type, which is "Text".
 *
 * @see {@link openTypePickerFromSelectedFilterType}
 */
export function openTypePickerFromDefaultFilterType() {
  openTypePickerFromSelectedFilterType("Text");
}

/**
 * Sets the SQL filter type.
 *
 * @param {("Text"|"Number"|"Date"|"Field Filter")} filterType
 *
 * @example
 * chooseType("Date");
 */
export function chooseType(filterType) {
  popover().within(() => {
    cy.findByText(filterType).click();
  });
}

// FILTER VALUE

/**
 * Enter filter value explicitly through the filter widget.
 *
 * @param {string} value
 */
export function setWidgetValue(value) {
  filterWidget().click().type(value);
}

/**
 * Enter a default value when filter is marked as required.
 *
 * @param {string} value
 */
export function setDefaultValue(value) {
  cy.findByPlaceholderText("Enter a default value…").type(value);
}

// UI PATTERNS

export function getRequiredToggle() {
  return cy.findByText("Always require a value");
}

export function getRequiredInput() {
  return cy.findByLabelText("Always require a value");
}

/**
 * Toggle the required SQL filter on or off. It is off by default.
 */
export function toggleRequired() {
  getRequiredToggle().click();
}

// FILTER QUERY

/**
 * Executes native query and waits for the results to load.
 * Makes sure that the question is not "dirty" after the query successfully ran.
 * @param {string} [xhrAlias ="dataset"]
 */
export function runQuery(xhrAlias = "dataset") {
  getRunQueryButton().click();
  cy.wait("@" + xhrAlias);
  cy.icon("play").should("not.exist");
}

/**
 * Enters parameterized native query into native editor.
 *
 * @param {string} query
 */
export function enterParameterizedQuery(query, options = {}) {
  focusNativeEditor();
  cy.get("@editor").type(query, {
    parseSpecialCharSequences: false,
    ...options,
  });
}

export function getRunQueryButton() {
  return cy.findByTestId("native-query-editor-sidebar").button("Get Answer");
}

export function getSaveQueryButton() {
  return cy.findByRole("button", { name: "Save" });
}
