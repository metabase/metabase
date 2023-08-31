import * as ML from "metabase-lib";
import type { FieldFilter } from "metabase-types/api";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import LegacyFilter from "metabase-lib/queries/structured/Filter";

export const getOperatorsMap = ({
  query,
  column,
  stageIndex = -1,
}: {
  query?: ML.Query;
  column?: ML.ColumnWithOperators;
  stageIndex?: number;
}) => {
  if (!query || !column) {
    return {};
  }

  const operators = ML.filterableColumnOperators(column);
  return Object.fromEntries(
    operators.map(operator => [
      ML.displayInfo(query, stageIndex, operator).shortName,
      operator,
    ]),
  );
};

export const getMlv2FilterClause = (filter: LegacyFilter, stageIndex = -1) => {
  const mlv2Query = filter.query().question()._getMLv2Query();

  const appliedFilterClause = ML.findFilterForLegacyFilter(
    mlv2Query,
    stageIndex,
    [...(filter as unknown as FieldFilter)],
  );

  const column = appliedFilterClause
    ? ML.filterParts(mlv2Query, stageIndex, appliedFilterClause).column
    : ML.findFilterableColumnForLegacyRef(mlv2Query, stageIndex, filter[1]);

  if (!column) {
    throw new Error(`Could not find column for filter ${filter}`);
  }

  const operatorsMap = getOperatorsMap({
    query: mlv2Query,
    column,
    stageIndex,
  });

  const unappliedFilterClause = ML.filterClause(
    operatorsMap[filter[0]],
    column as ML.ColumnMetadata,
    ...filter.slice(2),
  );

  // console.log({ appliedFilterClause, unappliedFilterClause, column })

  return {
    filterClause: appliedFilterClause ?? unappliedFilterClause,
    column,
    query: mlv2Query,
  };
};

export function toLegacyFilter(
  query: ML.Query,
  legacyQuery: StructuredQuery,
  filterClause: ML.FilterClause,
): LegacyFilter {
  const { operator, column, options, args } = ML.filterParts(
    query,
    -1,
    filterClause,
  );

  if (!operator || !column) {
    throw new Error(
      `Could not find operator or column for filter ${filterClause}`,
    );
  }

  const legacyFilter = new LegacyFilter(
    [
      ML.displayInfo(query, -1, operator).shortName,
      [...ML.legacyFieldRef(column).slice(0, 2), null], // to maintain compatibility with the old filter format
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
