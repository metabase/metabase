import { popover } from "__support__/e2e/cypress";

export function openPopoverFromSelectedFilterType(filterType) {
  cy.get(".AdminSelect-content")
    .contains(filterType)
    .click();
}

export function openPopoverFromDefaultFilterType() {
  openPopoverFromSelectedFilterType("Text");
}

/**
 * Sets the SQL filter type.
 *
 * @param {string} filterType
 *
 * @example
 * setFilterType("Text");
 * // Possible filter types: "Text", "Number", "Date", "Field Filter"
 */
export function setFilterType(filterType) {
  popover().within(() => {
    cy.findByText(filterType).click();
  });
}

export function runQuery(xhrAlias = "dataset") {
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.wait("@" + xhrAlias);
  cy.icon("play").should("not.exist");
}

/**
 *
 * @param {string} query
 */
export function enterNativeQuery(query) {
  cy.get("@editor").type(query, { parseSpecialCharSequences: false });
}

/**
 * Toggle the required filter on or off. It is off by default.
 *
 */
export function toggleRequiredFilter() {
  cy.findByText("Required?")
    .parent()
    .find("a")
    .click();
}

export function setRequiredFieldFilterDefaultValue(value) {
  toggleRequiredFilter();

  cy.findByText("Enter a default value...").click();

  if (Array.isArray(value)) {
    setBetweenFilterValue(value);
  } else {
    cy.findByPlaceholderText("Enter a default value...").type(value);
    cy.button("Add filter").click();
  }
}

/**
 * @param {Object} options
 * @param {string} options.table
 * @param {string} options.field
 */
export function mapFieldFilterTo({ table, field } = {}) {
  popover()
    .contains(table)
    .click();
  popover()
    .contains(field)
    .click();
}

export function setFilterWidgetType(type) {
  cy.findByText("Filter widget type")
    .parent()
    .find(".AdminSelect")
    .click();
  popover()
    .findByText(type)
    .click();
}

export function setFieldFilterWidgetValue(value) {
  cy.get("fieldset").click();

  if (Array.isArray(value)) {
    setBetweenFilterValue(value);
  } else {
    popover()
      .find("input")
      .type(value);
    cy.button("Add filter").click();
  }
}

export function setBetweenFilterValue([low, high] = []) {
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

// SQL filters

export function setFilterWidgetValue(value) {
  cy.get("fieldset")
    .click()
    .type(value);
}

export function setRequiredFilterDefaultValue(value) {
  toggleRequiredFilter();
  cy.findByPlaceholderText("Enter a default value...").type(value);
}
