import type { FilterOperator, FilterOperatorGroup } from "../../types";
import { findExact, isMatch } from "../SuggestionList/search";

export const hasSymbolKey = (operator: FilterOperator) =>
  /^[^a-z]+$/i.test(operator.key);

const getSearchTerms = (operator: FilterOperator) =>
  hasSymbolKey(operator) ? [operator.label, operator.key] : [operator.label];

export const findOperators = (
  operators: readonly FilterOperator[],
  query: string,
) =>
  operators.filter((operator) =>
    getSearchTerms(operator).some((term) => isMatch(term, query)),
  );

export const findOperatorGroups = (
  groups: readonly FilterOperatorGroup[],
  query: string,
) =>
  groups
    .map((group) => findOperators(group, query))
    .filter((group) => group.length > 0);

export const findExactOperator = (
  operators: readonly FilterOperator[],
  query: string,
) => {
  const search = query.trim().toLowerCase();
  const byKey = operators.find(
    (operator) => hasSymbolKey(operator) && operator.key === search,
  );
  return byKey ?? findExact(operators, (operator) => operator.label, query);
};
