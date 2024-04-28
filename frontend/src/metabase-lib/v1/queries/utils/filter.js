import _ from "underscore";

import {
  STANDARD_FILTERS,
  FILTER_OPERATORS,
  isLiteral,
} from "metabase-lib/v1/expressions";
import { getOperatorByTypeAndName } from "metabase-lib/v1/operators/utils";
import { isStartingFrom } from "metabase-lib/v1/queries/utils/query-time";
import { STRING } from "metabase-lib/v1/types/constants";

import { isValidField } from "./field-ref";
import { op, args, noNullValues, add, update, remove } from "./util";

// returns canonical list of Filters
export function getFilters(filter) {
  if (!filter || (Array.isArray(filter) && filter.length === 0)) {
    return [];
  } else if (op(filter) === "and") {
    return args(filter);
  } else {
    return [filter];
  }
}

// turns a list of Filters into the canonical FilterClause, either `undefined`, `filter`, or `["and", filter...]`
export function getFilterClause(filters) {
  if (filters.length === 0) {
    return undefined;
  } else if (filters.length === 1) {
    return filters[0];
  } else {
    return ["and", ...filters];
  }
}

export function addFilter(filter, newFilter) {
  return getFilterClause(add(getFilters(filter), newFilter));
}
export function updateFilter(filter, index, updatedFilter) {
  return getFilterClause(update(getFilters(filter), index, updatedFilter));
}
export function removeFilter(filter, index) {
  return getFilterClause(remove(getFilters(filter), index));
}

// MISC

export function canAddFilter(filter) {
  const filters = getFilters(filter);
  if (filters.length > 0) {
    return noNullValues(filters[filters.length - 1]);
  }
  return true;
}

// FILTER TYPES

export function isStandard(filter) {
  if (!Array.isArray(filter)) {
    return false;
  }

  const isStandardLiteral = arg => isLiteral(arg) || typeof arg === "boolean";

  // undefined args represents an incomplete filter (still standard, but not valid)
  const isLiteralOrUndefined = arg => (arg ? isStandardLiteral(arg) : true);

  const [op, field, ...args] = filter;

  if (isStartingFrom(filter)) {
    return true;
  }
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

export function isSegment(filter) {
  return Array.isArray(filter) && filter[0] === "segment";
}

export function isCustom(filter) {
  return !isStandard(filter) && !isSegment(filter);
}

export function isFieldFilter(filter) {
  return !isSegment(filter) && isValidField(filter[1]);
}

// FILTER OPTIONS

// TODO: is it safe to assume if the last item is an object then it's options?
export function hasFilterOptions(filter) {
  const o = filter[filter.length - 1];
  return !!o && typeof o == "object" && o.constructor === Object;
}

export function getFilterOptions(filter) {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  const _filter = filter;
  if (hasFilterOptions(filter)) {
    return _filter[_filter.length - 1];
  } else {
    return {};
  }
}

export function setFilterOptions(filter, options) {
  // NOTE: just make a new "any" variable since getting flow to type checking this is a nightmare
  let _filter = filter;
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
