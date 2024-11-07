import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotChangeQueryReaction } from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const changeQuery: ReactionHandler<MetabotChangeQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;

    const relativeDateFilterDetails = reaction.relative_date_filters ?? [];
    const queryWithRelativeDateFilters = relativeDateFilterDetails.reduce(
      (newQuery, details) => {
        const availableColumns = Lib.filterableColumns(query, stageIndex);
        const selectedColumn = availableColumns.find(
          column =>
            Lib.displayInfo(query, stageIndex, column).displayName ===
            details.column,
        );
        if (!selectedColumn) {
          return newQuery;
        }

        const sign = details.direction === "last" ? -1 : 1;
        const newClause = Lib.relativeDateFilterClause({
          column: selectedColumn,
          value:
            details.direction === "current" ? "current" : details.value * sign,
          bucket: details.unit,
          offsetValue: null,
          offsetBucket: null,
          options: {},
        });
        return Lib.filter(newQuery, stageIndex, newClause);
      },
      query,
    );

    const aggregationDetails = reaction.aggregations ?? [];
    const queryWithAggregations = aggregationDetails.reduce(
      (newQuery, details) => {
        const availableOperators = Lib.availableAggregationOperators(
          query,
          stageIndex,
        );
        const selectedOperator = availableOperators.find(
          operator =>
            Lib.displayInfo(query, stageIndex, operator).displayName ===
            details.operator,
        );
        if (!selectedOperator) {
          return newQuery;
        }

        const availableColumns =
          Lib.aggregationOperatorColumns(selectedOperator);
        const selectedColumn = availableColumns.find(
          column =>
            Lib.displayInfo(query, stageIndex, column).displayName ===
            details.column,
        );
        const selectedOperatorInfo = Lib.displayInfo(
          query,
          stageIndex,
          selectedOperator,
        );
        if (selectedOperatorInfo.requiresColumn && !selectedColumn) {
          return newQuery;
        }

        const newClause = Lib.aggregationClause(
          selectedOperator,
          selectedColumn,
        );
        return Lib.aggregate(query, stageIndex, newClause);
      },
      queryWithRelativeDateFilters,
    );

    const breakoutDetails = reaction.breakouts ?? [];
    const queryWithBreakouts = breakoutDetails.reduce((newQuery, details) => {
      const availableColumns = Lib.breakoutableColumns(newQuery, stageIndex);
      const selectedColumn = availableColumns.find(
        column =>
          Lib.displayInfo(newQuery, stageIndex, column).displayName ===
          details.column,
      );
      if (!selectedColumn) {
        return newQuery;
      }

      return Lib.breakout(
        newQuery,
        stageIndex,
        Lib.withDefaultBucket(newQuery, stageIndex, selectedColumn),
      );
    }, queryWithAggregations);

    const orderByDetails = reaction.order_bys ?? [];
    const queryWithOrderBy = orderByDetails.reduce((newQuery, details) => {
      const availableColumns = Lib.orderableColumns(newQuery, stageIndex);
      const selectedColumn = availableColumns.find(
        column =>
          Lib.displayInfo(newQuery, stageIndex, column).displayName ===
          details.column,
      );
      if (!selectedColumn) {
        return newQuery;
      }
      return Lib.orderBy(newQuery, stageIndex, selectedColumn);
    }, queryWithBreakouts);

    const limitDetails = reaction.limits ?? [];
    const queryWithLimit = limitDetails.reduce((newQuery, details) => {
      return Lib.limit(newQuery, stageIndex, details.limit);
    }, queryWithOrderBy);

    const newQuestion = question.setQuery(queryWithLimit);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
