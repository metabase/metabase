import type { FilterOperator } from "../../types";
import { findExact, isMatch } from "../SuggestionMenu/search";

const canTypeSymbol = (operator: FilterOperator) =>
  /^[^a-z]+$/i.test(operator.key);

const getSearchTerms = (operator: FilterOperator) =>
  canTypeSymbol(operator) ? [operator.label, operator.key] : [operator.label];

export const findOperators = (
  operators: readonly FilterOperator[],
  query: string,
) =>
  operators.filter((operator) =>
    getSearchTerms(operator).some((term) => isMatch(term, query)),
  );

export const findExactOperator = (
  operators: readonly FilterOperator[],
  query: string,
) => {
  const search = query.trim().toLowerCase();
  const byKey = operators.find(
    (operator) => canTypeSymbol(operator) && operator.key === search,
  );
  return byKey ?? findExact(operators, (operator) => operator.label, query);
};
