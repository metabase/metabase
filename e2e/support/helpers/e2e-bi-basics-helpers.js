import { queryBuilderMain, tableHeaderColumn } from "e2e/support/helpers";

/**
 * Initiate Summarize action
 *
 * @param {Object} options
 * @param {("notebook"|undefined)} options.mode
 */
export function summarize({ mode } = {}) {
  initiateAction("Summarize", mode);
}

export function filter({ mode } = {}) {
  initiateAction("Filter", mode);
}

export function join() {
  cy.button("Join data").click();
}

export function addCustomColumn() {
  initiateAction("CustomColumn", "notebook");
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

export function assertQueryBuilderRowCount(count) {
  const message =
    count === 1 ? "Showing 1 row" : `Showing ${count.toLocaleString()} rows`;
  cy.findByTestId("question-row-count").should("contain.text", message);
}

/**
 * Assert a join is valid by checking query builder UI and query results.
 * Expects a question to be visualized as a table.
 *
 * @param {string} [lhsTable] join's LHS table name
 * @param {string} [rhsTable] join's RHS table name
 * @param {string} lhsSampleColumn join's LHS sample column name
 * @param {string} rhsSampleColumn join's RHS sample column name
 */
export function assertJoinValid({
  lhsTable,
  rhsTable,
  lhsSampleColumn,
  rhsSampleColumn,
}) {
  // Ensure the QB shows `${lhsTable} + ${rhsTable}` in the header
  // The check is optional for cases when a table name isn't clear (e.g. a multi-stage ad-hoc question)
  if (lhsTable && rhsTable) {
    cy.findByTestId("question-table-badges").within(() => {
      cy.findByText(lhsTable).should("be.visible");
      cy.findByText(rhsTable).should("be.visible");
    });
  }

  // Ensure the results have columns from both tables
  queryBuilderMain().within(() => {
    tableHeaderColumn(lhsSampleColumn).should("be.visible");
    tableHeaderColumn(rhsSampleColumn).should("be.visible");
  });
}
