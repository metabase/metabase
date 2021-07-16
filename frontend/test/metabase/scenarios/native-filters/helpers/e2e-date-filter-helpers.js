import { popover } from "__support__/e2e/cypress";

const currentYearString = new Date().getFullYear().toString();

export function setMonthAndYear({ month, year } = {}) {
  cy.findByText(currentYearString).click();

  cy.findByText(year).click();
  cy.findByText(month).click();
}

export function setQuarterAndYear({ quarter, year } = {}) {
  cy.findByText(currentYearString).click();

  cy.findByText(year).click();
  cy.findByText(quarter).click();
}

export function setSingleDate(day) {
  cy.findByText(day).click();
}

export function setDateRange({ startDate, endDate } = {}) {
  cy.findByText(startDate).click();
  cy.findByText(endDate).click();
}

export function setRelativeDate(term) {
  cy.findByText(term).click();
}

export function setAdHocFilter({ condition, quantity, timeBucket } = {}) {
  if (condition) {
    cy.get(".AdminSelect")
      .contains("Previous")
      .click();

    popover()
      .last()
      .contains(condition)
      .click();
  }

  if (quantity) {
    cy.findByPlaceholderText("30")
      .clear()
      .type(quantity);
  }

  if (timeBucket) {
    cy.get(".AdminSelect")
      .contains("Days")
      .click();

    popover()
      .last()
      .contains(timeBucket)
      .click();
  }

  cy.button("Update filter").click();
}
