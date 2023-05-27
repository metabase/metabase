import { filterWidget, popover } from "e2e/support/helpers";

// FILTER WIDGET TYPE

/**
 * Sets a field filter widget type. Depends on the field that field filter is mapped to.
 *
 * @param {string} type
 */
export function setWidgetType(type) {
  cy.findByText("Filter widget type")
    .parent()
    .findByTestId("select-button")
    .click();

  popover().findByText(type).click();
}

// FIELD FILTER STRING FILTERS

/**
 * Adds string filter value explicitly through the filter widget.
 *
 * @param {string} value
 */
export function addWidgetStringFilter(value) {
  setWidgetStringFilter(value);
  cy.button("Add filter").click();
}

export function setWidgetStringFilter(value) {
  popover().find("input").first().type(`${value}{enter}`);
}

/**
 * Selects value from the field values list filter widget
 *
 * @param {string} value
 */

export function selectFilterValueFromList(value, { addFilter = true } = {}) {
  popover().within(() => {
    cy.findByText(value).click();

    if (addFilter) {
      cy.button("Add filter").click();
    }
  });
}

/**
 * Applies filter value by filter type
 *
 * @param {string} filter
 * @param {string} value
 */

export function applyFilterByType(filter, value) {
  if (["Is", "Is not"].includes(filter)) {
    selectFilterValueFromList(value);
  } else {
    addWidgetStringFilter(value);
  }
}

/**
 * Adds default string filter value when the filter is marked as required.
 *
 * @param {string} value
 */
export function addDefaultStringFilter(value) {
  enterDefaultValue(value);
}

// FIELD FILTER NUMBER FILTERS

/**
 * Adds number filter value explicitly through the filter widget.
 *
 * @param {string} value
 * @return {function}
 */
export function addWidgetNumberFilter(value) {
  return isBetweenFilter(value)
    ? addBetweenFilter(value)
    : addSimpleNumberFilter(value);
}

/**
 *
 * @param {array|string} value
 * @return {function}
 */
export function addDefaultNumberFilter(value) {
  return isBetweenFilter(value)
    ? addBetweenFilter(value)
    : enterDefaultValue(value);
}

// UI PATTERNS

/**
 * Maps a field filter to some particular table field.
 *
 * @param {Object} options
 * @param {string} options.table
 * @param {string} options.field
 */
export function mapTo({ table, field } = {}) {
  popover().contains(table).click();

  popover().contains(field).click();
}

/**
 * Opens a field filter entry form.
 * Entry type that it opens (input, picker) depends on the underlying field filter type.
 *
 * @param {boolean} isFilterRequired
 */
export function openEntryForm(isFilterRequired) {
  const selector = isFilterRequired
    ? cy.findByText("Enter a default value…")
    : filterWidget();

  selector.click();
}

export function closeEntryForm() {
  popover().within(() => {
    cy.get("input").type("{esc}");
  });
}

// LOCAL SCOPE

/**
 *
 * @param {Array.<string>} options
 */
function addBetweenFilter([low, high] = []) {
  popover().within(() => {
    cy.get("input").first().type(`${low}{enter}`);

    cy.get("input").last().type(`${high}{enter}`);
  });

  cy.button("Add filter").click();
}

/**
 *
 * @param {string} value
 */
function addSimpleNumberFilter(value) {
  cy.findByPlaceholderText("Enter a number").type(`${value}{enter}`);
  cy.button("Add filter").click();
}

/**
 *
 * @param {string} value
 */
function enterDefaultValue(value) {
  cy.findByText("Enter a default value…").click();
  cy.findByPlaceholderText("Enter a default value…").type(`${value}{enter}`);
  cy.button("Add filter").click();
}

/**
 * @param {string} searchTerm
 * @param {string} result
 */
export function pickDefaultValue(searchTerm, result) {
  cy.findByText("Enter a default value…").click();
  cy.findByPlaceholderText("Enter a default value…").type(searchTerm);

  // Popover is re-rendering every 100ms!
  // That prevents us from targeting popover() element first,
  // and then searching for strings inside of it.
  //
  // Until FE finds a better solution, our best bet for E2E tests
  // is to make sure the string is "visible" before acting on it.
  // This seems to help with the flakiness.
  //
  cy.findByTestId(`${result}-filter-value`).should("be.visible").click();

  cy.button("Add filter").click();
}

/**
 *
 * @param {string|Array.<string>} value
 * @returns {boolean}
 */
function isBetweenFilter(value) {
  return Array.isArray(value) && value.length === 2;
}

export function clearDefaultFilterValue() {
  cy.findByText("Default filter widget value")
    .parent()
    .find(".Icon-close")
    .click();
}
