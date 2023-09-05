import * as ML from "metabase-lib";
import type { FieldFilter } from "metabase-types/api";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import LegacyFilter from "metabase-lib/queries/structured/Filter";

export const getOperatorsMap = (
  query?: ML.Query,
  stageIndex?: number,
  column?: ML.ColumnWithOperators,
) => {
  if (!query || !column) {
    return {};
  }

  const operators = ML.filterableColumnOperators(column);
  return Object.fromEntries(
    operators.map(operator => [
      ML.displayInfo(query, stageIndex ?? -1, operator).shortName,
      operator,
    ]),
  );
};

export const getMLv2FilterClause = (filter: LegacyFilter) => {
  const query = filter.query().rootQuery().question()._getMLv2Query();
  const stageIndex = filter.query().getStageIndex();

  const appliedFilterClause = ML.findFilterForLegacyFilter(
    query,
    stageIndex,
    filter.raw() as FieldFilter,
  );

  const dimensionMBQL = filter.dimension()?.mbql();

  if (!dimensionMBQL) {
    throw new Error(`Could not find dimension for filter ${filter}`);
  }

  const column = appliedFilterClause
    ? ML.filterParts(query, stageIndex, appliedFilterClause).column
    : ML.findFilterableColumnForLegacyRef(query, stageIndex, dimensionMBQL);

  if (!column) {
    throw new Error(`Could not find column for filter ${filter}`);
  }

  const operatorsMap = getOperatorsMap(query, stageIndex, column);

  const unappliedFilterClause = ML.filterClause(
    operatorsMap[filter.operatorName()],
    column,
    filter.arguments(),
    filter.options(),
  );

  return {
    filterClause: appliedFilterClause ?? unappliedFilterClause,
    column,
    query,
    legacyQuery: filter.query(),
    stageIndex,
  };
};

export function toLegacyFilter(
  query: ML.Query,
  stageIndex: number,
  legacyQuery: StructuredQuery,
  filterClause: ML.FilterClause,
): LegacyFilter {
  const { operator, column, options, args } = ML.filterParts(
    query,
    stageIndex,
    filterClause,
  );

  if (!operator || !column) {
    throw new Error(
      `Could not find operator or column for filter ${filterClause}`,
    );
  }

  const legacyFilter = new LegacyFilter(
    [
      ML.displayInfo(query, stageIndex, operator).shortName,
      ML.legacyFieldRef(column),
      ...args,
    ],
    null,
    legacyQuery,
  );

  if (Object.keys(options).length > 0) {
    legacyFilter.setOptions(options);
  }

  return legacyFilter;
}
