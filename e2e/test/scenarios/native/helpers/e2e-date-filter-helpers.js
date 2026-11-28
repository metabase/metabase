import { popover, selectDropdown } from "e2e/support/helpers";

const currentYearString = new Date().getFullYear().toString();

export function setMonthAndYear({ month, year } = {}) {
  popover().within(() => {
    cy.findByText(currentYearString).click();
    cy.findByText(year).click();
    cy.findByText(month).click();
  });
}

export function setSingleDate(date) {
  popover().findByLabelText("Date").clear().type(date).blur();
}

export function setRelativeDate(term) {
  cy.findByText(term).click();
}

/**
 * @param {object} [options]
 * @param {string} [options.condition]
 * @param {string} [options.quantity]
 * @param {string} [options.timeBucket]
 * @param {boolean} [options.includeCurrent]
 * @param {string} [buttonLabel]
 */
export function setAdHocFilter(
  { condition, quantity, timeBucket, includeCurrent = false } = {},
  buttonLabel = "Add filter",
) {
  cy.findByText("Relative date range…").click();
  if (condition) {
    cy.findByText(condition).click({ force: true });
  } else {
    cy.findByText("Previous").click({ force: true });
  }

  if (quantity) {
    cy.findByLabelText("Interval").clear().type(quantity);
  }

  if (timeBucket) {
    cy.findByRole("textbox", { name: "Unit" })
      .should("have.value", "days")
      .click();

    selectDropdown().contains(timeBucket).click();
  }

  if (includeCurrent) {
    popover()
      .findByLabelText(/Include/)
      .click();
  }

  cy.button(buttonLabel).click();
}
