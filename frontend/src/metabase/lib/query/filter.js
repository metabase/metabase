/* @flow */

import { mbqlEq, op, args, noNullValues } from "./util";

import type { FilterClause, Filter } from "metabase/meta/types/Query";

export function getFilters(filter: ?FilterClause): Filter[] {
    if (!filter) {
        return [];
    } else if (mbqlEq(op(filter), "and")) {
        return args(filter);
    } else {
        return [filter];
    }
}

export function canAddFilter(filter: ?FilterClause): boolean {
    const filters = getFilters(filter);
    if (filters.length > 0) {
        return noNullValues(filters[filters.length - 1]);
    }
    return true;
}

export function addFilter(filter: ?FilterClause, newFilter: FilterClause): ?FilterClause {
    const filters = getFilters(filter);
    return canonicalize([...filters, newFilter]);
}

export function updateFilter(filter: ?FilterClause, index: number, updatedFilter: FilterClause): ?FilterClause {
    const filters = getFilters(filter);
    return canonicalize([...filters.slice(0, index), updatedFilter, ...filters.slice(index + 1)]);
}

export function removeFilter(filter: ?FilterClause, index: number): ?FilterClause {
    const filters = getFilters(filter);
    return canonicalize([...filters.slice(0, index), ...filters.slice(index + 1)]);
}

function canonicalize(filters: Filter[]): ?FilterClause {
    if (filters.length === 0) {
        return undefined;
    } else if (filters.length === 1) {
        return filters[0];
    } else {
        return (["and", ...filters]: any);
    }
}
