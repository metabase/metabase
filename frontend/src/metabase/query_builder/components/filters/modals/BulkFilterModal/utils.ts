import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Filter from "metabase-lib/lib/queries/structured/Filter";

/**
 * for this modal only, if a numeric field has an invalid between filter that has only one value
 * we will intuit that the user wants a >= or <=  filter
 **/

export function handleEmptyBetweens(query: StructuredQuery): StructuredQuery {
  const betweenFilters = query
    .filters()
    .filter(filter => filter.operatorName() === "between");

  for (const filter of betweenFilters) {
    if (countValidArumgents(filter) === 1) {
      const [validArgument] = filter.arguments().filter(isValidArgument);
      let newFilter = filter.setArguments([validArgument]);

      if (isValidArgument(filter.arguments()[0])) {
        newFilter = newFilter.setOperator(">=");
      } else {
        newFilter = newFilter.setOperator("<=");
      }
      // we need to recurse here because we need to process the rest
      // of our filters from a new query
      return handleEmptyBetweens(filter.replace(newFilter));
    }
  }

  return query;
}

const isValidArgument = (arg: number | null | undefined) =>
  !(arg === null || arg === undefined);

const countValidArumgents = (filter: Filter) =>
  filter
    .arguments()
    .reduce((count, arg) => (isValidArgument(arg) ? count + 1 : count), 0);
