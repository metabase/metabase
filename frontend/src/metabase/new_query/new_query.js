/**
 * Redux actions and reducers for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { handleActions, combineReducers } from "metabase/lib/redux";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Question from "metabase-lib/lib/Question";

/**
 * Initializes the new query flow for a given question
 */
export const INITIALIZE_NEW_QUERY = "metabase/new_query/INITIALIZE_NEW_QUERY";
export function initializeNewQuery(question: Question) {
    return function(dispatch, getState) {
        const query = new StructuredQuery(question);
        dispatch.action(INITIALIZE_NEW_QUERY, query)
    }
}

export const UPDATE_QUERY = "metabase/new_query/UPDATE_QUERY";
export function updateQuery(updatedQuery: StructuredQuery) {
    return function(dispatch, getState) {
        dispatch.action(UPDATE_QUERY, updatedQuery)
    }
}

/**
 * The current query that we are creating
 */

// TODO Atte Keinänen 6/12/17: Test later how Flow typing with redux-actions could work best for our reducers
// something like const query = handleActions<StructuredQuery>({
const query = handleActions({
    [INITIALIZE_NEW_QUERY]: (state, { payload }): StructuredQuery => payload,
    [UPDATE_QUERY]: (state, { payload }): StructuredQuery => payload
}, null);

export default combineReducers({
    query
});
