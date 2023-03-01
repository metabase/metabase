import { popover } from "e2e/support/helpers";

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

export function setAdHocFilter({
  condition,
  quantity,
  timeBucket,
  includeCurrent = false,
} = {}) {
  cy.findByText("Relative dates...").click();
  if (condition) {
    cy.findByText(condition).click({ force: true });
  } else {
    cy.findByText("Past").click({ force: true });
  }

  if (quantity) {
    cy.findByPlaceholderText("30").clear().type(quantity);
  }

  if (timeBucket) {
    cy.findAllByTestId("relative-datetime-unit").contains("days").click();

    popover().last().contains(timeBucket).click();
  }

  if (includeCurrent) {
    popover().within(() => {
      cy.icon("ellipsis").click();
    });
    cy.findByText(/^Include/).click();
  }

  cy.button("Update filter").click();
}
