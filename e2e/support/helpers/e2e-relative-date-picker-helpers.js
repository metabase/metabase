import { popover } from "./e2e-ui-elements-helpers";

// Units have different labels depending on the value and time direction (past/future)
// Example: "1 day", "2 days" for interval value "1 day ago" and "2 days from now" for offset value
function getUnitRegexp(unitName) {
  return new RegExp(`^${unitName}`, "i");
}

/**
 * Sets the interval value and unit.
 *
 * @param {number} params.value - interval value
 * @param {string} params.unit - interval unit in singular form (e.g. "day", not "days")
 */
function setValue({ value, unit }) {
  popover().within(() => {
    cy.findByLabelText("Interval").clear().type(value);
    cy.findByLabelText("Unit").click();
  });
  cy.findAllByText(getUnitRegexp(unit)).last().click();
}

/**
 * Sets the offset value and unit.
 *
 * @param {number} params.value - interval value
 * @param {string} params.unit - interval unit in singular form (e.g. "day", not "days")
 */
function setStartingFrom({ value, unit }) {
  popover().within(() => {
    cy.findByLabelText("Starting from interval").clear().type(value);
    cy.findByLabelText("Starting from unit").click();
  });
  cy.findAllByText(getUnitRegexp(unit)).last().click();
}

/**
 * Adds the offset value and unit.
 *
 * @param {number} params.value - interval value
 * @param {string} params.unit - interval unit in singular form (e.g. "day", not "days")
 */
function addStartingFrom({ value, unit }) {
  popover().within(() => {
    cy.findByLabelText("Options").click();
    cy.findByText("Starting from…").click();
  });
  setStartingFrom({ value, unit });
}

function toggleCurrentInterval() {
  popover().within(() => {
    cy.findByLabelText("Options").click();
    cy.findByTestId("include-current-interval-option").click();
  });
}

export const relativeDatePicker = {
  setValue,
  setStartingFrom,
  addStartingFrom,
  toggleCurrentInterval,
};
