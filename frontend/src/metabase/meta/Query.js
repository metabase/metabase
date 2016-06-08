/* @flow */

import type { StructuredQueryObject, FilterClause } from "./types/Query";

export function hasValidAggregation(query: StructuredQueryObject): bool {
    return false; // FIXME
}

export function addFilter(query: StructuredQueryObject, newFilter: FilterClause): StructuredQueryObject {
    const filters = getFilters(query);
    return setFilters(query, [...filters.slice(), newFilter]); // TODO: figure out why flow complains without .slice()
}

export function updateFilter(query: StructuredQueryObject, index: number, updatedFilter: FilterClause): StructuredQueryObject {
    const filters = getFilters(query);
    return setFilters(query, [...filters.slice(0, index), updatedFilter, ...filters.slice(index + 1)]);
}

export function removeFilter(query: StructuredQueryObject, index: number): StructuredQueryObject {
    const filters = getFilters(query);
    return setFilters(query, [...filters.slice(0, index), ...filters.slice(index + 1)]);
}

function getFilters(query: StructuredQueryObject): Array<FilterClause> {
    if (query.filters == null || query.filters.length === 0) {
        return [];
    } else if (query.filters[0] === "and") {
        return query.filters.slice(1);
    } else {
        return [query.filters];
    }
}

function setFilters(query: StructuredQueryObject, filters: Array<FilterClause>): StructuredQueryObject {
    if (filters.length === 0) {
        query = { ...query };
        delete query.filters;
        return query;
    } else if (filters.length === 1) {
        return { ...query, filters: filters[0] };
    } else {
        return { ...query, filters: ["and"].concat(filters) };
    }
}
