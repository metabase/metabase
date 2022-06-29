import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

// fix between filters with missing or misordered arguments
export function fixBetweens(query: StructuredQuery): StructuredQuery {
  const betweenFilters = query
    .filters()
    .filter(filter => filter.operatorName() === "between");

  for (const filter of betweenFilters) {
    const validArgumentsCount = countValidArumgents(filter);
    if (validArgumentsCount === 1) {
      return fixBetweens(handleEmptyBetween(filter));
    } else if (validArgumentsCount === 2 && hasBackwardsArguments(filter)) {
      return fixBetweens(swapFilterArguments(filter));
    }
  }

  return query;
}

/**
 * if a numeric field has an invalid between filter that has only one value
 * we will intuit that the user wants a >= or <=  filter
 *
 * @param filter a filter with a single valid argument
 * @returns a new query with this filter's operator changed
 */
export function handleEmptyBetween(filter: Filter): StructuredQuery {
  const [validArgument] = filter.arguments().filter(isValidArgument);

  const newOperator = isValidArgument(filter.arguments()[0]) ? ">=" : "<=";

  const newFilter = filter
    .setOperator(newOperator)
    .setArguments([validArgument]);

  return filter.replace(newFilter);
}

/**
 * swaps the filter's arguments
 * @param filter a filter with backwards arguments
 * @returns a new query with this filter's arguments swapped
 */
export function swapFilterArguments(filter: Filter): StructuredQuery {
  const [lowerArgument, upperArgument] = filter.arguments();
  const newFilter = filter.setArguments([upperArgument, lowerArgument]);
  return filter.replace(newFilter);
}

const isValidArgument = (arg: number | null | undefined) =>
  !(arg === null || arg === undefined);

const countValidArumgents = (filter: Filter) =>
  filter
    .arguments()
    .reduce((count, arg) => (isValidArgument(arg) ? count + 1 : count), 0);

export const hasBackwardsArguments = (filter: Filter) => {
  const [lowerArgument, upperArgument] = filter.arguments();
  return lowerArgument > upperArgument;
};
