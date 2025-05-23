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
function setValue({ value, unit }, containerGetter) {
  containerGetter().within(() => {
    cy.findByLabelText("Interval").clear().type(value);
    cy.findByLabelText("Unit", { selector: "input" }).click();
  });
  cy.findByRole("listbox")
    .findByRole("option", { name: getUnitRegexp(unit) })
    .click();
}

/**
 * Sets the offset value and unit.
 *
 * @param {number} params.value - interval value
 * @param {string} params.unit - interval unit in singular form (e.g. "day", not "days")
 */
function setStartingFrom({ value, unit }, containerGetter) {
  containerGetter().within(() => {
    cy.findByLabelText("Starting from interval").clear().type(value);
    cy.findByLabelText("Starting from unit", { selector: "input" }).click();
  });
  cy.findByRole("listbox")
    .findByRole("option", { name: getUnitRegexp(unit) })
    .click();
}

/**
 * Adds the offset value and unit.
 *
 * @param {number} params.value - interval value
 * @param {string} params.unit - interval unit in singular form (e.g. "day", not "days")
 */
function addStartingFrom({ value, unit }, containerGetter) {
  containerGetter().findByLabelText("Starting from…").click();
  setStartingFrom({ value, unit }, containerGetter);
}

function toggleCurrentInterval(containerGetter) {
  containerGetter()
    .findByTestId("include-current-interval-option")
    .click({ force: true });
}

export const relativeDatePicker = {
  setValue,
  setStartingFrom,
  addStartingFrom,
  toggleCurrentInterval,
};
