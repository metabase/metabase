import type { CyHttpMessages } from "cypress/types/net-stubbing";

import {
  entityPickerModal,
  entityPickerModalTab,
  popover,
} from "e2e/support/helpers/e2e-ui-elements-helpers";
import type { NotebookStepType } from "metabase/query_builder/components/notebook/types";

export function notebookButton() {
  return cy
    .findByTestId("qb-header-action-panel")
    .findByTestId("notebook-button");
}

/**
 * Switch to a notebook editor from a simple query view (aka "chill mode").
 */
export function openNotebook() {
  return notebookButton().click();
}

/**
 * Select a specific notebook step like filter, join, breakout, etc.
 *
 * @see {@link https://github.com/metabase/metabase/pull/17708#discussion_r700082403}
 */
export function getNotebookStep(
  type: Exclude<NotebookStepType, "aggregate" | "breakout">,
  { stage = 0, index = 0 } = {},
): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.findByTestId(`step-${type}-${stage}-${index}`);
}

/**
 * @summary Visualize notebook query results.
 *
 * This helper intelligently waits for the query to load, and gives you an option
 * to assert on the waited query response.
 *
 * @example
 * visualize();
 *
 * visualize(response => {
 *   expect(response.body.error).to.not.exist;
 * });
 */
export function visualize(
  callback?: (response?: CyHttpMessages.IncomingResponse) => void,
) {
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.button("Visualize").click();

  cy.wait("@dataset").then(({ response }) => {
    if (callback) {
      callback(response);
    }
  });
}

/**
 * Summarize (Aggregate).
 *
 * Doesn't support summarizing using Custom Expression or Common Metrics!
 */
export function addSummaryField({
  metric,
  table,
  field,
  stage = 0,
  index = 0,
}: {
  metric: string;
  table?: string;
  field?: string;
  stage?: number;
  index?: number;
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

/**
 * Breakout (Group by in the UI).
 */
export function addSummaryGroupingField({
  table,
  field,
  stage = 0,
  index = 0,
}: {
  table?: string;
  field: string;
  stage?: number;
  index?: number;
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

/**
 * Remove breakout.
 */
export function removeSummaryGroupingField({
  field,
  stage = 0,
  index = 0,
}: {
  field: string;
  stage: number;
  index: number;
}) {
  getNotebookStep("summarize", { stage, index })
    .findByTestId("breakout-step")
    .findByText(field)
    .icon("close")
    .click();
}

/**
 * Join a raw table given a table and optional LHS and RHS column names
 * (for cases when join condition can't be selected automatically).
 *
 * Expects a join popover to be open!
 *
 */
export function joinTable(
  tableName: string,
  lhsColumnName?: string,
  rhsColumnName?: string,
) {
  entityPickerModal().within(() => {
    entityPickerModalTab("Tables").click();
    cy.findByText(tableName).click();
  });

  if (lhsColumnName && rhsColumnName) {
    popover().findByText(lhsColumnName).click();
    popover().findByText(rhsColumnName).click();
  }
}

/**
 * Open a saved question and join it with another saved question.
 *
 * Depends on a `startNewQuestion()` helper to work properly!
 *
 * @todo Either decouple this dependency or use `startNewQuestion()` directly here.
 *
 * @example
 * startNewQuestion();
 * selectSavedQuestionsToJoin("Q1", "Q2");
 */
export function selectSavedQuestionsToJoin(
  firstQuestionName: string,
  secondQuestionName: string,
) {
  cy.intercept("GET", "/api/table/*/query_metadata").as("joinedTableMetadata");
  entityPickerModal().within(() => {
    entityPickerModalTab("Models").should("exist");
    entityPickerModalTab("Tables").should("exist");
    entityPickerModalTab("Saved questions").click();
    cy.findByText(firstQuestionName).click();
  });

  cy.wait("@joinedTableMetadata");

  // join to question b
  cy.icon("join_left_outer").click();

  entityPickerModal().within(() => {
    entityPickerModalTab("Models").should("exist");
    entityPickerModalTab("Tables").should("exist");
    entityPickerModalTab("Saved questions").click();
    cy.findByText(secondQuestionName).click();
  });
}

export function selectFilterOperator(operatorName: string) {
  cy.findByLabelText("Filter operator").click();
  cy.findByRole("listbox").findByText(operatorName).click();
}
