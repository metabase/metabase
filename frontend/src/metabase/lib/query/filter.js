import { op, args, noNullValues, add, update, remove, clear } from "./util";
import { isValidField } from "./field_ref";
import {
  STANDARD_FILTERS,
  FILTER_OPERATORS,
  isLiteral,
} from "metabase/lib/expressions";

import { STRING, getOperatorByTypeAndName } from "metabase/lib/schema_metadata";

import _ from "underscore";

import type {
  FilterClause,
  Filter,
  FilterOptions,
} from "metabase-types/types/Query";

// returns canonical list of Filters
export function getFilters(filter: ?FilterClause): Filter[] {
  if (!filter || (Array.isArray(filter) && filter.length === 0)) {
    return [];
  } else if (op(filter) === "and") {
    return args(filter);
  } else {
    return [filter];
  }
}

// turns a list of Filters into the canonical FilterClause, either `undefined`, `filter`, or `["and", filter...]`
function getFilterClause(filters: Filter[]): ?FilterClause {
  if (filters.length === 0) {
    return undefined;
  } else if (filters.length === 1) {
    return filters[0];
  } else {
    return (["and", ...filters]: any);
  }
}

export function addFilter(
  filter: ?FilterClause,
  newFilter: FilterClause,
): ?FilterClause {
  return getFilterClause(add(getFilters(filter), newFilter));
}
export function updateFilter(
  filter: ?FilterClause,
  index: number,
  updatedFilter: FilterClause,
): ?FilterClause {
  return getFilterClause(update(getFilters(filter), index, updatedFilter));
}
export function removeFilter(
  filter: ?FilterClause,
  index: number,
): ?FilterClause {
  return getFilterClause(remove(getFilters(filter), index));
}
export function clearFilters(filter: ?FilterClause): ?FilterClause {
  return getFilterClause(clear());
}

// MISC

export function canAddFilter(filter: ?FilterClause): boolean {
  const filters = getFilters(filter);
  if (filters.length > 0) {
    return noNullValues(filters[filters.length - 1]);
  }
  return true;
}

// FILTER TYPES

export function isStandard(filter: FilterClause): boolean {
  if (!Array.isArray(filter)) {
    return false;
  }

  const isStandardLiteral = arg => isLiteral(arg) || typeof arg === "boolean";

  // undefined args represents an incomplete filter (still standard, but not valid)
  const isLiteralOrUndefined = arg => (arg ? isStandardLiteral(arg) : true);

  const [op, field, ...args] = filter;

  if (FILTER_OPERATORS.has(op) || op === "between") {
    // only allows constant argument(s), e.g. 42 in ["<", field, 42]
    return isValidField(field) && _.all(args, arg => isLiteralOrUndefined(arg));
  }
  const stringOp = getOperatorByTypeAndName(STRING, op);
  if (stringOp) {
    // do not check filter option, e.g. "case-sensitive" for "contains"
    const optionNames = _.keys(stringOp.options);
    const isOptionName = arg => _.contains(optionNames, _.first(_.keys(arg)));
    const valueArgs = _.filter(args, arg => !isOptionName(arg));
    return (
      isValidField(field) && _.all(valueArgs, arg => isLiteralOrUndefined(arg))
    );
  }

  return (
    (STANDARD_FILTERS.has(op) || op === null) &&
    (field === undefined || isValidField(field))
  );
}

export function isSegment(filter: FilterClause): boolean {
  return Array.isArray(filter) && filter[0] === "segment";
}

export function isCustom(filter: FilterClause): boolean {
  return !isStandard(filter) && !isSegment(filter);
}

export function isFieldFilter(filter: FilterClause): boolean {
  return !isSegment(filter) && isValidField(filter[1]);
}

// FILTER OPTIONS

// TODO: is it safe to assume if the last item is an object then it's options?
export function hasFilterOptions(filter: Filter): boolean {
  const o = filter[filter.length - 1];
  return !!o && typeof o == "object" && o.constructor === Object;
}

export function getFilterOptions(filter: Filter): FilterOptions {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  const _filter: any = filter;
  if (hasFilterOptions(filter)) {
    return _filter[_filter.length - 1];
  } else {
    return {};
  }
}

export function setFilterOptions<T: Filter>(
  filter: T,
  options: FilterOptions,
): T {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  let _filter: any = filter;
  // if we have option, strip it off for now
  if (hasFilterOptions(filter)) {
    _filter = _filter.slice(0, -1);
  }
  // if options isn't emtpy, append it
  if (Object.keys(options).length > 0) {
    _filter = [..._filter, options];
  }
  return _filter;
}
