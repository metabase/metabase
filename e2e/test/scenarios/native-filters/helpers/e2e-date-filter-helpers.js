import { popover, selectDropdown } from "e2e/support/helpers";

const currentYearString = new Date().getFullYear().toString();

export function setMonthAndYear({ month, year } = {}) {
  popover().within(() => {
    cy.findByText(currentYearString).click();
    cy.findByText(year).click();
    cy.findByText(month).click();
  });
}

export function setQuarterAndYear({ quarter, year } = {}) {
  popover().within(() => {
    cy.findByText(currentYearString).click();
    cy.findByText(year).click();
    cy.findByText(quarter).click();
  });
}

export function setSingleDate(date) {
  cy.findByLabelText("Date").clear().type(date).blur();
}

export function setTime({ hours, minutes }) {
  popover().within(() => {
    cy.findByText("Add time").click();
    cy.findByLabelText("Time")
      .clear()
      .type(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
      );
  });
}

export function setDateRange({ startDate, endDate } = {}) {
  cy.findByLabelText("Start date").clear().type(startDate).blur();
  cy.findByLabelText("End date").clear().type(endDate).blur();
}

export function setRelativeDate(term) {
  cy.findByText(term).click();
}

export function setAdHocFilter(
  { condition, quantity, timeBucket, includeCurrent = false } = {},
  buttonLabel = "Add filter",
) {
  cy.findByText("Relative dates…").click();
  if (condition) {
    cy.findByText(condition).click({ force: true });
  } else {
    cy.findByText("Previous").click({ force: true });
  }

  if (quantity) {
    cy.findByLabelText("Interval").clear().type(quantity);
  }

  if (timeBucket) {
    cy.findByLabelText("Unit").should("have.value", "days").click();

    selectDropdown().contains(timeBucket).click();
  }

  if (includeCurrent) {
    popover()
      .findByText(/Include/)
      .click();
  }

  cy.button(buttonLabel).click();
}
