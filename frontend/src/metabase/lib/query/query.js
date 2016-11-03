/* @flow */

import type { StructuredQuery as SQ, Filter } from "metabase/meta/types/Query";

import * as F from "./filter";

export const getFilters = (query: SQ): Filter[] => F.getFilters(query.filter);

export const addFilter = (query: SQ, filter: Filter): SQ =>
    setClause(query, "filter", F.addFilter(query.filter, filter));

export const updateFilter = (query: SQ, index: number, filter: Filter): SQ =>
    setClause(query, "filter", F.updateFilter(query.filter, index, filter));

export const removeFilter = (query: SQ, index: number): SQ =>
    setClause(query, "filter", F.removeFilter(query.filter, index));

export const canAddFilter = (query: SQ): boolean => F.canAddFilter(query.filter);


// TODO: remove mutation
type FilterClauseName = "filter"|"aggregation"|"breakout"|"order_by"|"limit";
function setClause(query: SQ, clauseName: FilterClauseName, clause: ?any): SQ {
    if (clause == null) {
        delete query[clauseName];
    } else {
        query[clauseName] = clause
    }
    return query;
}
