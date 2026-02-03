import type { CyHttpMessages } from "cypress/types/net-stubbing";

import {
  entityPickerModal,
  miniPicker,
  miniPickerBrowseAll,
  popover,
} from "e2e/support/helpers/e2e-ui-elements-helpers";
import type { NotebookStepType } from "metabase/querying/notebook/types";
import type { IconName } from "metabase/ui";

export function notebookButton() {
  return cy
    .findByTestId("qb-header-action-panel")
    .findByTestId("notebook-button");
}

export function startSort() {
  getNotebookStep("summarize").findByText("Sort").click();
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
 * Doesn't support summarizing using Custom Expression or Metrics!
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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
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
  bucketSize,
}: {
  table?: string;
  field: string;
  stage?: number;
  index?: number;
  bucketSize?: string;
}) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  getNotebookStep("summarize", { stage, index })
    .findByTestId("breakout-step")
    .findAllByTestId("notebook-cell-item")
    .last()
    .click();

  popover().within(() => {
    if (table) {
      cy.findByText(table).click();
    }

    if (bucketSize) {
      cy.findByText(field)
        .realHover()
        .closest("[data-testid=dimension-list-item]")
        .findByTestId("dimension-list-item-binning")
        .click();
    } else {
      cy.findByText(field).click();
    }
  });

  if (bucketSize) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    popover().last().findByText(bucketSize).click();
  }
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
  stage?: number;
  index?: number;
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
  miniPicker().within(() => {
    cy.realType(tableName);
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
  miniPickerBrowseAll().click();
  entityPickerModal().within(() => {
    cy.findByText("Our analytics").click();
    cy.findByText(firstQuestionName).click();
  });

  cy.wait("@joinedTableMetadata");

  // join to question b
  cy.icon("join_left_outer").click();

  miniPickerBrowseAll().click();
  entityPickerModal().within(() => {
    cy.findByText("Our analytics").click();
    cy.findByText(secondQuestionName).click();
  });
}

export function selectFilterOperator(operatorName: string) {
  cy.findByLabelText("Filter operator").click();
  cy.findByRole("menu").findByText(operatorName).click();
}

type JoinType = "left-join" | "right-join" | "inner-join" | "full-join";

export type Stage = {
  joins?: {
    lhsTable: string;
    rhsTable: string;
    type: JoinType;
    conditions: {
      operator: "=" | ">" | "<" | ">=" | "<=" | "!=";
      lhsColumn: string;
      rhsColumn: string;
    }[];
  }[];
  expressions?: string[];
  filters?: string[];
  aggregations?: string[];
  breakouts?: string[];
  sort?: {
    column: string;
    order: "asc" | "desc";
  }[];
  limit?: number;
};

export function verifyNotebookQuery(dataSource: string, stages: Stage[] = []) {
  getNotebookStep("data").findByText(dataSource).should("be.visible");

  for (let stageIndex = 0; stageIndex < stages.length; ++stageIndex) {
    const {
      joins,
      expressions,
      filters,
      aggregations,
      breakouts,
      sort,
      limit,
    } = stages[stageIndex];

    verifyNotebookJoins(stageIndex, joins);
    verifyNotebookExpressions(stageIndex, expressions);
    verifyNotebookFilters(stageIndex, filters);
    verifyNotebookAggregations(stageIndex, aggregations, breakouts);
    verifyNotebookBreakouts(stageIndex, aggregations, breakouts);
    verifyNotebookSort(stageIndex, sort);
    verifyNotebookLimit(stageIndex, limit);
  }
}

function verifyNotebookJoins(
  stageIndex: number,
  joins: Stage["joins"] | undefined,
) {
  const joinTypeIcons: Record<JoinType, IconName> = {
    "left-join": "join_left_outer",
    "right-join": "join_right_outer",
    "inner-join": "join_inner",
    "full-join": "join_full_outer",
  };

  if (Array.isArray(joins)) {
    cy.findAllByTestId(new RegExp(`^step-join-${stageIndex}-\\d+$`)).should(
      "have.length",
      joins.length,
    );

    for (let joinIndex = 0; joinIndex < joins.length; ++joinIndex) {
      const { lhsTable, rhsTable, type, conditions } = joins[joinIndex];

      getJoinItems(stageIndex, joinIndex).eq(0).should("have.text", lhsTable);
      getJoinItems(stageIndex, joinIndex).eq(1).should("have.text", rhsTable);

      getNotebookStep("join", { stage: stageIndex, index: joinIndex })
        .icon(joinTypeIcons[type])
        .should("be.visible");

      getNotebookStep("join", { stage: stageIndex, index: joinIndex })
        .findAllByTestId(/^join-condition-\d+$/)
        .should("have.length", conditions.length);

      for (
        let conditionIndex = 0;
        conditionIndex < conditions.length;
        ++conditionIndex
      ) {
        const { operator, lhsColumn, rhsColumn } = conditions[conditionIndex];
        getNotebookStep("join", { stage: stageIndex, index: joinIndex })
          .findByTestId(`join-condition-${conditionIndex}`)
          .within(() => {
            cy.findByLabelText("Left column")
              .should("contain.text", lhsTable)
              .and("contain.text", lhsColumn);

            cy.findByLabelText("Right column")
              .should("contain.text", rhsTable)
              .and("contain.text", rhsColumn);

            cy.findByLabelText("Change operator").should("have.text", operator);
          });
      }
    }
  } else {
    getNotebookStep("join", { stage: stageIndex }).should("not.exist");
  }
}

function verifyNotebookExpressions(
  stageIndex: number,
  expressions: string[] | undefined,
) {
  if (Array.isArray(expressions)) {
    getExpressionItems(stageIndex).should(
      "have.length",
      expressions.length + 1, // +1 because of add button
    );

    for (let index = 0; index < expressions.length; ++index) {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getExpressionItems(stageIndex)
        .eq(index)
        .should("have.text", expressions[index]);
    }
  } else {
    getNotebookStep("expression", { stage: stageIndex }).should("not.exist");
  }
}

function verifyNotebookFilters(
  stageIndex: number,
  filters: string[] | undefined,
) {
  if (Array.isArray(filters)) {
    getFilterItems(stageIndex).should(
      "have.length",
      filters.length + 1, // +1 because of add button
    );

    for (let index = 0; index < filters.length; ++index) {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getFilterItems(stageIndex).eq(index).should("have.text", filters[index]);
    }
  } else {
    getNotebookStep("filter", { stage: stageIndex }).should("not.exist");
  }
}

function verifyNotebookAggregations(
  stageIndex: number,
  aggregations: string[] | undefined,
  breakouts: string[] | undefined,
) {
  if (Array.isArray(aggregations)) {
    getNotebookStep("summarize", { stage: stageIndex }).scrollIntoView();
    getSummarizeItems(stageIndex, "aggregate").should(
      "have.length",
      aggregations.length + 1, // +1 because of add button
    );

    for (let index = 0; index < aggregations.length; ++index) {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getSummarizeItems(stageIndex, "aggregate")
        .eq(index)
        .should("have.text", aggregations[index]);
    }
  } else {
    if (Array.isArray(breakouts)) {
      getSummarizeItems(stageIndex, "aggregate").should(
        "have.length",
        1, // 1 because of add button
      );
    } else {
      getNotebookStep("summarize", { stage: stageIndex }).should("not.exist");
    }
  }
}

function verifyNotebookBreakouts(
  stageIndex: number,
  aggregations: string[] | undefined,
  breakouts: string[] | undefined,
) {
  if (Array.isArray(breakouts)) {
    getSummarizeItems(stageIndex, "breakout").should(
      "have.length",
      breakouts.length + 1, // +1 because of add button
    );

    for (let index = 0; index < breakouts.length; ++index) {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getSummarizeItems(stageIndex, "breakout")
        .eq(index)
        .should("have.text", breakouts[index]);
    }
  } else {
    if (Array.isArray(aggregations)) {
      getSummarizeItems(stageIndex, "breakout").should(
        "have.length",
        1, // 1 because of add button
      );
    } else {
      getNotebookStep("summarize", { stage: stageIndex }).should("not.exist");
    }
  }
}

function verifyNotebookSort(
  stageIndex: number,
  sort:
    | {
        column: string;
        order: "asc" | "desc";
      }[]
    | undefined,
) {
  if (Array.isArray(sort)) {
    getSortItems(stageIndex).should(
      "have.length",
      sort.length + 1, // +1 because of add button
    );

    for (let index = 0; index < sort.length; ++index) {
      const { column, order } = sort[index];
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getSortItems(stageIndex).eq(index).should("have.text", column);
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getSortItems(stageIndex)
        .eq(index)
        .icon(order === "asc" ? "arrow_up" : "arrow_down")
        .should("be.visible");
    }
  } else {
    getNotebookStep("sort", { stage: stageIndex }).should("not.exist");
  }
}

function verifyNotebookLimit(stageIndex: number, limit: number | undefined) {
  if (typeof limit === "number") {
    getNotebookStep("limit", { stage: stageIndex })
      .findByPlaceholderText("Enter a limit")
      .should("have.value", String(limit));
  } else {
    getNotebookStep("limit", { stage: stageIndex }).should("not.exist");
  }
}

function getJoinItems(stageIndex: number, index: number) {
  return getNotebookStep("join", { stage: stageIndex, index }).findAllByTestId(
    "notebook-cell-item",
  );
}

function getExpressionItems(stageIndex: number) {
  return getNotebookStep("expression", { stage: stageIndex }).findAllByTestId(
    "notebook-cell-item",
  );
}

function getFilterItems(stageIndex: number) {
  return getNotebookStep("filter", { stage: stageIndex }).findAllByTestId(
    "notebook-cell-item",
  );
}

function getSummarizeItems(
  stageIndex: number,
  stepType: Extract<NotebookStepType, "aggregate" | "breakout">,
) {
  return getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId(stepType === "aggregate" ? "aggregate-step" : "breakout-step")
    .findAllByTestId("notebook-cell-item");
}

function getSortItems(stageIndex: number) {
  return getNotebookStep("sort", { stage: stageIndex }).findAllByTestId(
    "notebook-cell-item",
  );
}

export function clauseStepPopover() {
  return popover({ testId: "clause-popover" });
}
