import { popover } from "e2e/support/helpers";

/**
 * Initiate Summarize action
 *
 * @param {(undefined|"notebook")} mode
 */
export function summarize({ mode } = {}) {
  initiateAction("Summarize", mode);
}

export function filter({ mode } = {}) {
  initiateAction("Filter", mode);
}

export function join() {
  initiateAction("Join", "notebook");
}

export function addCustomColumn() {
  initiateAction("CustomColumn", "notebook");
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
 * @param {("Summarize"|"Filter"|"Join"|"CustomColumn")} actionType
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

const ACTION_TYPE_TO_ICON_MAP = {
  Filter: "filter",
  Summarize: "sum",
  Join: "join_left_outer",
  CustomColumn: "add_data",
};

/**
 * Get the appropriate icon depending on the action type.
 *
 * @param {("Summarize"|"Filter"|"Join"|"CustomColumn")} actionType
 * @returns string
 */
function getIcon(actionType) {
  return ACTION_TYPE_TO_ICON_MAP[actionType];
}
