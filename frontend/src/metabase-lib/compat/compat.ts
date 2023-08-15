import type StructuredQuery from "../queries/StructuredQuery";
import LegacyFilter from "../queries/structured/Filter";
import { findColumnIndexesFromLegacyRefs } from "../comparison";
import { legacyFieldRef } from "../fields";
import { filters, filterableColumns } from "../filter";
import type {
  ColumnWithOperators,
  ExternalOp,
  ExpressionArg,
  FilterOperator,
  Query,
} from "../types";
import { compareFilters, findOperator, fixExternalOp } from "./utils";

const stageIndex = -1;

type Result = {
  operator: FilterOperator | null;
  column: ColumnWithOperators | null;
  options: Record<string, any>;
  args: (ExpressionArg | ColumnWithOperators)[];
};

function getExternalOpForDraftFilter(query: Query, legacyFilter: LegacyFilter) {
  const result: Result = {
    operator: null,
    column: null,
    options: legacyFilter.options(),
    args: legacyFilter.arguments().raw(),
  };

  const fieldRef = legacyFilter.dimension()?.mbql();
  const legacyOperator = legacyFilter.operator();

  if (fieldRef) {
    const columns = filterableColumns(query, stageIndex);
    // Could be a more high-level CLJC method
    const [index] = findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      columns,
      [fieldRef],
    );
    result.column = columns[index];
  }

  if (result.column && legacyOperator) {
    result.operator = findOperator(query, result.column, legacyOperator.name);
  }

  return result;
}

export function getMLv2FilterFromMLv1Filter(legacyFilter: LegacyFilter) {
  // MLv1 filter.query() can be a stage query.
  // For MLv2, we need to use the root query + stage index
  const legacyQuery = legacyFilter.query();
  const legacyRootQuery = legacyQuery.rootQuery();
  const query = legacyRootQuery.getMLv2Query();

  if (legacyFilter.isValid()) {
    const filterIndex = legacyQuery
      .filters()
      .findIndex(filter => compareFilters(filter, legacyFilter));

    const filter = filters(query, stageIndex)[filterIndex];

    // Filter is applied to a given query,
    // just take an MLv2 filter by filter index and use it
    if (filter) {
      const filter = filters(query, stageIndex)[filterIndex];
      return {
        query,
        filter,
        externalOp: fixExternalOp(query, filter),
      };
    }
  }

  return {
    query,
    filter: null,
    externalOp: getExternalOpForDraftFilter(query, legacyFilter),
  };
}

// Something we can use to submit a partially complete filter
// from an MLv2-driven leaf component
// to a MLv1-driven parent component
export function getDraftMLv1FilterFromExternalOp(
  legacyQuery: StructuredQuery,
  query: Query,
  externalOp: ExternalOp,
) {
  const {
    operator: operatorName,
    options,
    args: [column, ...args],
  } = externalOp;

  const fieldRef = legacyFieldRef(column);

  // This won't be needed once externalOp returns `operator` as an opaque object
  const operator = findOperator(query, column, operatorName);

  return new LegacyFilter(
    [operator, fieldRef, ...args, options],
    null,
    legacyQuery,
  );
}

export function getMLv1FilterFromMLv2Filter() {
  // Could do a look up by filter index
}
