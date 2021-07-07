import { filterWidget, popover } from "__support__/e2e/cypress";

// FILTER WIDGET TYPE

/**
 * Sets a field filter widget type. Depends on the field that field filter is mapped to.
 *
 * @param {string} type
 */
export function setWidgetType(type) {
  cy.findByText("Filter widget type")
    .parent()
    .find(".AdminSelect")
    .click();

  popover()
    .findByText(type)
    .click();
}

// FIELD FILTER STRING FILTERS

/**
 * Adds string filter value explicitly through the filter widget.
 *
 * @param {string} value
 */
export function addWidgetStringFilter(value) {
  popover()
    .find("input")
    .type(value);
  cy.button("Add filter").click();
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
  popover()
    .contains(table)
    .click();

  popover()
    .contains(field)
    .click();
}

/**
 * Opens a field filter entry form.
 * Entry type that it opens (input, picker) depends on the underlying field filter type.
 *
 * @param {boolean} isFilterRequired
 */
export function openEntryForm(isFilterRequired) {
  const selector = isFilterRequired
    ? cy.findByText("Enter a default value...")
    : filterWidget();

  selector.click();
}

// LOCAL SCOPE

/**
 *
 * @param {Array.<string>} options
 */
function addBetweenFilter([low, high] = []) {
  popover().within(() => {
    cy.get("input")
      .first()
      .type(low);

    cy.get("input")
      .last()
      .type(high);
  });

  cy.button("Add filter").click();
}

/**
 *
 * @param {string} value
 */
function addSimpleNumberFilter(value) {
  cy.findByPlaceholderText("Enter a number").type(value);
  cy.button("Add filter").click();
}

/**
 *
 * @param {string} value
 */
function enterDefaultValue(value) {
  cy.findByPlaceholderText("Enter a default value...").type(value);
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
