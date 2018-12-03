/**
 * Redux actions and reducers for the new query flow
 * (used both for new questions and for adding "ad-hoc metrics" to multi-query questions)
 */

import { handleActions, combineReducers } from "metabase/lib/redux";
import {
  fetchDatabases,
  fetchMetrics,
  fetchSegments,
} from "metabase/redux/metadata";

import { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/lib/queries/StructuredQuery";
import type { DatasetQuery } from "metabase/meta/types/Card";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";
import { push } from "react-router-redux";

/**
 * Initializes the new query flow for a given question
 */
export const RESET_QUERY = "metabase/new_query/RESET_QUERY";
export function resetQuery() {
  return function(dispatch, getState) {
    dispatch.action(RESET_QUERY, STRUCTURED_QUERY_TEMPLATE);
  };
}

const newQueryOptionsDefault = {
  loaded: false,
  hasDatabases: false,
  showMetricOption: false,
  showTableOption: false,
  showSQLOption: false,
};

const newQueryOptionsAllVisible = {
  loaded: true,
  hasDatabases: true,
  showMetricOption: true,
  showTableOption: true,
  showSQLOption: true,
};

export const DETERMINE_OPTIONS_STARTED =
  "metabase/new_query/DETERMINE_OPTIONS_STARTED";
export const DETERMINE_OPTIONS = "metabase/new_query/DETERMINE_OPTIONS";
export function determineWhichOptionsToShow(getGuiQueryUrl) {
  return async (dispatch, getState) => {
    // By default, show all options instantly to admins
    const isAdmin = getUserIsAdmin(getState());
    dispatch.action(
      DETERMINE_OPTIONS_STARTED,
      isAdmin
        ? newQueryOptionsAllVisible
        : {
            loaded: false,
            hasDatabases: false,
            showMetricOption: false,
            showTableOption: false,
            showSQLOption: false,
          },
    );

    await Promise.all([
      dispatch(fetchDatabases()),
      dispatch(fetchMetrics()),
      dispatch(fetchSegments()),
    ]);

    const metadata = getMetadata(getState());
    const hasDatabases = metadata.databasesList().length > 0;

    if (!hasDatabases) {
      return dispatch.action(DETERMINE_OPTIONS, {
        loaded: true,
        hasDatabases: false,
      });
    } else if (isAdmin) {
      return dispatch.action(DETERMINE_OPTIONS, newQueryOptionsAllVisible);
    } else {
      const showMetricOption = metadata.metricsList().length > 0;

      // to be able to use SQL the user must have write permissions on at least one db
      const hasSQLPermission = db => db.native_permissions === "write";
      const showSQLOption =
        metadata.databasesList().filter(hasSQLPermission).length > 0;

      // if we can only show one option then we should just redirect
      const redirectToQueryBuilder = !showMetricOption && !showSQLOption;

      if (redirectToQueryBuilder) {
        dispatch(push(getGuiQueryUrl()));
      } else {
        return dispatch.action(DETERMINE_OPTIONS, {
          loaded: true,
          hasDatabases: true,
          showMetricOption,
          showSQLOption,
        });
      }
    }
  };
}

/**
 * The current query that we are creating
 */

const newQueryOptions = handleActions(
  {
    [DETERMINE_OPTIONS_STARTED]: (state, { payload }): DatasetQuery => payload,
    [DETERMINE_OPTIONS]: (state, { payload }): DatasetQuery => payload,
  },
  newQueryOptionsDefault,
);

const datasetQuery = handleActions(
  {
    [RESET_QUERY]: (state, { payload }): DatasetQuery => payload,
  },
  STRUCTURED_QUERY_TEMPLATE,
);

export default combineReducers({
  newQueryOptions,
  datasetQuery,
});
