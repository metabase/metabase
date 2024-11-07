import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type {
  MetabotAggregateQueryDetails,
  MetabotBreakoutQueryDetails,
  MetabotChangeQueryReaction,
  MetabotLimitQueryDetails,
  MetabotOrderByQueryDetails,
  MetabotRelativeDateFilterDetails,
} from "metabase-types/api";

import type { ReactionHandler } from "./types";

const STAGE_INDEX = -1;

function addRelativeDateFilter(
  query: Lib.Query,
  details: MetabotRelativeDateFilterDetails,
) {
  const availableColumns = Lib.filterableColumns(query, STAGE_INDEX);
  const selectedColumn = availableColumns.find(
    column =>
      Lib.displayInfo(query, STAGE_INDEX, column).displayName ===
      details.column,
  );
  if (!selectedColumn) {
    return query;
  }

  const sign = details.direction === "last" ? -1 : 1;
  const newClause = Lib.relativeDateFilterClause({
    column: selectedColumn,
    value: details.direction === "current" ? "current" : details.value * sign,
    bucket: details.unit,
    offsetValue: null,
    offsetBucket: null,
    options: {},
  });
  return Lib.filter(query, STAGE_INDEX, newClause);
}

function addAggregation(
  query: Lib.Query,
  details: MetabotAggregateQueryDetails,
) {
  const availableOperators = Lib.availableAggregationOperators(
    query,
    STAGE_INDEX,
  );
  const selectedOperator = availableOperators.find(
    operator =>
      Lib.displayInfo(query, STAGE_INDEX, operator).displayName ===
      details.operator,
  );
  if (!selectedOperator) {
    return query;
  }

  const availableColumns = Lib.aggregationOperatorColumns(selectedOperator);
  const selectedColumn = availableColumns.find(
    column =>
      Lib.displayInfo(query, STAGE_INDEX, column).displayName ===
      details.column,
  );
  const selectedOperatorInfo = Lib.displayInfo(
    query,
    STAGE_INDEX,
    selectedOperator,
  );
  if (selectedOperatorInfo.requiresColumn && !selectedColumn) {
    return query;
  }

  const newClause = Lib.aggregationClause(selectedOperator, selectedColumn);
  return Lib.aggregate(query, STAGE_INDEX, newClause);
}

function addBreakout(query: Lib.Query, details: MetabotBreakoutQueryDetails) {
  const availableColumns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const selectedColumn = availableColumns.find(
    column =>
      Lib.displayInfo(query, STAGE_INDEX, column).displayName ===
      details.column,
  );
  if (!selectedColumn) {
    return query;
  }

  return Lib.breakout(
    query,
    STAGE_INDEX,
    Lib.withDefaultBucket(query, STAGE_INDEX, selectedColumn),
  );
}

function addLimit(query: Lib.Query, details: MetabotLimitQueryDetails) {
  return Lib.limit(query, STAGE_INDEX, details.limit);
}

function addOrderBy(query: Lib.Query, details: MetabotOrderByQueryDetails) {
  const availableColumns = Lib.orderableColumns(query, STAGE_INDEX);
  const selectedColumn = availableColumns.find(
    column =>
      Lib.displayInfo(query, STAGE_INDEX, column).displayName ===
      details.column,
  );
  if (!selectedColumn) {
    return query;
  }
  return Lib.orderBy(query, STAGE_INDEX, selectedColumn);
}

export const changeQuery: ReactionHandler<MetabotChangeQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    let query = question.query();
    query = (reaction.relative_date_filters ?? []).reduce(
      addRelativeDateFilter,
      query,
    );
    query = (reaction.aggregations ?? []).reduce(addAggregation, query);
    query = (reaction.breakouts ?? []).reduce(addBreakout, query);
    query = (reaction.order_bys ?? []).reduce(addOrderBy, query);
    query = (reaction.limits ?? []).reduce(addLimit, query);
    const newQuestion = question.setQuery(query);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
