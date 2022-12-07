import { popover } from "__support__/e2e/helpers";

export function summarize({ mode } = {}) {
  initiateAction("Summarize", mode);
}

export function filter({ mode } = {}) {
  initiateAction("Filter", mode);
}

export function filterField(
  fieldName,
  { operator, value, placeholder, order } = {},
) {
  if (operator) {
    changeOperator(getFilterField(fieldName, order), operator);
  }

  if (value) {
    changeValue(getFilterField(fieldName, order), value, placeholder);
  }

  return getFilterField(fieldName, order);
}

export function filterFieldPopover(
  fieldName,
  { value, placeholder, order } = {},
) {
  getFilterField(fieldName, order).within(() => {
    cy.get("input").click();
  });

  if (value) {
    changeValue(popover(), value, placeholder);
  }
  return popover();
}

function getFilterField(fieldName, order = 0) {
  return cy.findAllByTestId(`filter-field-${fieldName}`).eq(order);
}

function changeOperator(subject, operator) {
  subject.findByTestId("operator-select").click();

  cy.findByTestId("operator-options")
    .findAllByText(new RegExp(operator, "i"))
    .first()
    .click();
}

function changeValue(subject, newValue, placeholder) {
  subject.within(() => {
    const input = placeholder
      ? cy.findByPlaceholderText(new RegExp(placeholder, "i"))
      : cy.get("input").first();

    input.clear().type(newValue);
  });
}

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
