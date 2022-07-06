import { popover } from "__support__/e2e/helpers";

export function summarize({ mode } = {}) {
  initiateAction("Summarize", mode);
}

export function filter({ mode } = {}) {
  initiateAction("Filter", mode);
}

export function filterField(fieldName) {
  return cy.findByLabelText(`filter-field-${fieldName}`);
}

export function filterFieldPopover(fieldName) {
  cy.findByLabelText(`filter-field-${fieldName}`).within(() => {
    cy.findByTestId("select-button").click();
  });
  return popover();
}

function changeOperator(subject, operator) {
  cy.wrap(subject).findByTestId("operator-select").click();

  cy.findByTestId("operator-options")
    .findAllByText(new RegExp(operator, "i"))
    .first()
    .click();
  return cy.wrap(subject);
}

function changeValue(subject, newValue, placeholder) {
  cy.wrap(subject).within(() => {
    const input = placeholder
      ? cy.findByPlaceholderText(new RegExp(placeholder, "i"))
      : cy.get("input").first();

    input.clear().type(newValue);
  });
  return cy.wrap(subject);
}

Cypress.Commands.add("changeOperator", { prevSubject: true }, changeOperator);
Cypress.Commands.add("changeValue", { prevSubject: true }, changeValue);

/**
 * Initiate a certain action such as filtering or summarizing taking the question's mode into account.
 *
 * @param {("Summarize"|"Filter")} actionType
 * @param {(undefined|"notebook")} mode
 */
function initiateAction(actionType, mode) {
  const icon = getIcon(actionType);

  if (mode === "notebook") {
    cy.findAllByTestId("action-buttons").find(`.Icon-${icon}`).click();
  } else {
    // This line could potentially reduce or completely eliminate binning flakes where sidebar renders empty because of the race condition
    cy.findByText(/^Doing science/).should("not.exist");

    cy.findByTestId("qb-header-action-panel").contains(actionType).click();
  }
}

/**
 * Get the appropriate icon depending on the action type.
 *
 * @param {("Summarize"|"Filter")} actionType
 * @returns string
 */
function getIcon(actionType) {
  let icon;

  switch (actionType) {
    case "Filter":
      icon = "filter";
      break;

    case "Summarize":
      icon = "sum";
      break;

    default:
      break;
  }

  return icon;
}
