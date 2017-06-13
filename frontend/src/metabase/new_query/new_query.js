/**
 * Redux actions and reducers for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { handleActions, combineReducers } from "metabase/lib/redux";
import StructuredQuery, { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/lib/queries/StructuredQuery";
import type { DatasetQuery } from "metabase/meta/types/Card";

/**
 * Initializes the new query flow for a given question
 */
export const RESET_QUERY = "metabase/new_query/RESET_QUERY";
export function resetQuery() {
    return function(dispatch, getState) {
        dispatch.action(RESET_QUERY, STRUCTURED_QUERY_TEMPLATE)
    }
}

export const UPDATE_QUERY = "metabase/new_query/UPDATE_QUERY";
export function updateQuery(updatedQuery: StructuredQuery) {
    return function(dispatch, getState) {
        dispatch.action(UPDATE_QUERY, updatedQuery.datasetQuery())
    }
}

/**
 * The current query that we are creating
 */
// TODO Atte Keinänen 6/12/17: Test later how Flow typing with redux-actions could work best for our reducers
// something like const query = handleActions<DatasetQuery>({
const datasetQuery = handleActions({
    [RESET_QUERY]: (state, { payload }): DatasetQuery => payload,
    [UPDATE_QUERY]: (state, { payload }): DatasetQuery => payload
}, STRUCTURED_QUERY_TEMPLATE);

export default combineReducers({
    datasetQuery
});
