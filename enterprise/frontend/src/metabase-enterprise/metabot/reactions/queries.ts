import dayjs from "dayjs";

import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type {
  MetabotAggregateQueryDetails,
  MetabotBooleanFilterDetails,
  MetabotBreakoutQueryDetails,
  MetabotChangeQueryReaction,
  MetabotLimitQueryDetails,
  MetabotNumberFilterDetails,
  MetabotOrderByQueryDetails,
  MetabotRelativeDateFilterDetails,
  MetabotSpecificDateFilterDetails,
  MetabotStringFilterDetails,
} from "metabase-types/api";

import type { ReactionHandler } from "./types";

const STAGE_INDEX = -1;

function addStringFilter(
  query: Lib.Query,
  details: MetabotStringFilterDetails,
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

  const newClause = Lib.stringFilterClause({
    column: selectedColumn,
    operator: details.operator,
    values: [details.value],
    options: {},
  });
  return Lib.filter(query, STAGE_INDEX, newClause);
}

function addNumberFilter(
  query: Lib.Query,
  details: MetabotNumberFilterDetails,
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

  const newClause = Lib.numberFilterClause({
    column: selectedColumn,
    operator: details.operator,
    values: [details.value],
  });
  return Lib.filter(query, STAGE_INDEX, newClause);
}

function addBooleanFilter(
  query: Lib.Query,
  details: MetabotBooleanFilterDetails,
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

  const newClause = Lib.booleanFilterClause({
    column: selectedColumn,
    operator: "=",
    values: [details.value],
  });
  return Lib.filter(query, STAGE_INDEX, newClause);
}

function addSpecificDateFilter(
  query: Lib.Query,
  details: MetabotSpecificDateFilterDetails,
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
  const value = dayjs(details.value);
  if (!value.isValid()) {
    return query;
  }

  const newClause = Lib.specificDateFilterClause(query, STAGE_INDEX, {
    column: selectedColumn,
    operator: details.operator,
    values: [value.toDate()],
    hasTime: false,
  });
  return Lib.filter(query, STAGE_INDEX, newClause);
}

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
    query = reaction.string_filters.reduce(addStringFilter, query);
    query = reaction.number_filters.reduce(addNumberFilter, query);
    query = reaction.boolean_filters.reduce(addBooleanFilter, query);
    query = reaction.specific_date_filters.reduce(addSpecificDateFilter, query);
    query = reaction.relative_date_filters.reduce(addRelativeDateFilter, query);
    query = reaction.aggregations.reduce(addAggregation, query);
    query = reaction.breakouts.reduce(addBreakout, query);
    query = reaction.order_bys.reduce(addOrderBy, query);
    query = reaction.limits.reduce(addLimit, query);
    const newQuestion = question.setQuery(query);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
