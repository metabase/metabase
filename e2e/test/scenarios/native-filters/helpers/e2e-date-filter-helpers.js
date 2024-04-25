import { popover } from "e2e/support/helpers";

const currentYearString = new Date().getFullYear().toString();

export function setMonthAndYear({ month, year } = {}) {
  cy.findByText(currentYearString).click();

  cy.findByText(year).click();
  cy.findByText(month).click();
}

export function setQuarterAndYear({ quarter, year } = {}) {
  popover().findByText(currentYearString).click();

  popover().last().findByText(year).click();
  popover().findByText(quarter).click();
}

function setDate(date, container) {
  container.findByRole("textbox").clear().type(date).blur();
}

export function setSingleDate(date) {
  setDate(date, cy.findByTestId("specific-date-picker"));
}

export function setTime({ hours, minutes }) {
  popover().within(() => {
    cy.findByText("Add a time").click();
    cy.findByPlaceholderText("hh").clear().type(hours);
    cy.findByPlaceholderText("mm").clear().type(minutes);
  });
}

export function setDateRange({ startDate, endDate } = {}) {
  setDate(startDate, cy.findAllByTestId("specific-date-picker").first());
  setDate(endDate, cy.findAllByTestId("specific-date-picker").last());
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

  cy.button("Add filter").click();
}
