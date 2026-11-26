import type { FilterOperator, FilterOperatorGroup } from "../../types";
import type { DraftPick } from "../FilterBar/draft-suggestion";
import { findExact, isMatch } from "../SuggestionList/search";
import type { SuggestionGroup } from "../SuggestionList/utils";

const hasSymbolKey = (operator: FilterOperator) =>
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

export const getOperatorSuggestions = <F>(
  groups: readonly FilterOperatorGroup[],
  query: string,
): SuggestionGroup<DraftPick<F>>[] =>
  groups
    .map((group) => findOperators(group, query))
    .filter((group) => group.length > 0)
    .map((group) => ({
      key: `operators:${group[0].key}`,
      rows: group.map((operator) => ({
        type: "item",
        key: `operator:${operator.key}`,
        label: operator.label,
        hint: hasSymbolKey(operator) ? operator.key : undefined,
        value: { type: "operator", operator },
      })),
    }));

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
