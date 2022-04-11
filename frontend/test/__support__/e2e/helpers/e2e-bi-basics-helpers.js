export function summarize({ mode } = {}) {
  initiateAction("Summarize", mode);
}

export function filter({ mode } = {}) {
  initiateAction("Filter", mode);
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
    cy.findAllByTestId("action-buttons")
      .find(`.Icon-${icon}`)
      .click();
  } else {
    // This line could potentially reduce or completely eliminate binning flakes where sidebar renders empty because of the race condition
    cy.findByText(/^Doing science/).should("not.exist");

    cy.findByTestId("qb-header-action-panel")
      .contains(actionType)
      .click();
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
