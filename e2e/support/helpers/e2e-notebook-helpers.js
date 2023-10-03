import { popover } from "e2e/support/helpers/e2e-ui-elements-helpers";

export function openNotebook() {
  return cy.icon("notebook").click();
}

/**
 * Helps to select specific notebook steps like filters, joins, break outs, etc.
 *
 * Details:
 * https://github.com/metabase/metabase/pull/17708#discussion_r700082403
 *
 * @param {string} type — notebook step type (filter, join, expression, summarize, etc.)
 * @param {{stage: number; index: number}} positionConfig - indexes specifying step's position
 * @returns
 */
export function getNotebookStep(type, { stage = 0, index = 0 } = {}) {
  return cy.findByTestId(`step-${type}-${stage}-${index}`);
}

/**
 * Visualize notebook query results.
 *
 * @param {function} callback
 */
export function visualize(callback) {
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.button("Visualize").click();

  cy.wait("@dataset").then(({ response }) => {
    if (callback) {
      callback(response);
    }
  });
}

export function addSummaryField({
  metric,
  table,
  field,
  stage = 0,
  index = 0,
}) {
  getNotebookStep("summarize", { stage, index })
    .findByTestId("aggregate-step")
    .findAllByTestId("notebook-cell-item")
    .last()
    .click();

  popover().within(() => {
    cy.findByText(metric).click();
    if (table) {
      cy.findByText(table).click();
    }
    if (field) {
      cy.findByText(field).click();
    }
  });
}

export function addSummaryGroupingField({
  table,
  field,
  stage = 0,
  index = 0,
}) {
  getNotebookStep("summarize", { stage, index })
    .findByTestId("breakout-step")
    .findAllByTestId("notebook-cell-item")
    .last()
    .click();

  popover().within(() => {
    if (table) {
      cy.findByText(table).click();
    }
    cy.findByText(field).click();
  });
}

export function removeSummaryGroupingField({ field, stage = 0, index = 0 }) {
  getNotebookStep("summarize", { stage, index })
    .findByTestId("breakout-step")
    .findByText(field)
    .icon("close")
    .click();
}

/**
 * Joins a raw table given a table and optional LHS and RHS column names
 * (for cases when join condition can't be selected automatically)
 *
 * Expects a join popover to be open
 *
 * @param {string} tableName
 * @param {string} [lhsColumnName]
 * @param {string} [rhsColumnName]
 */
export function joinTable(tableName, lhsColumnName, rhsColumnName) {
  popover().findByText(tableName).click();
  if (lhsColumnName && rhsColumnName) {
    popover().findByText(lhsColumnName).click();
    popover().findByText(rhsColumnName).click();
  }
}

export function selectSavedQuestionsToJoin(
  firstQuestionName,
  secondQuestionName,
) {
  cy.intercept("GET", "/api/database/*/schemas").as("loadSchemas");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Saved Questions").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(firstQuestionName).click();
  cy.wait("@loadSchemas");

  // join to question b
  cy.icon("join_left_outer").click();

  popover().within(() => {
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.findByTextEnsureVisible("Raw Data").click();
    cy.findByTextEnsureVisible("Saved Questions").click();
    cy.findByText(secondQuestionName).click();
  });
}
