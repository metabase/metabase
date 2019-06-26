import _ from "underscore";
import moment from "moment";

import { createThunkAction } from "metabase/lib/redux";

import { ActivityApi } from "metabase/services";

// action constants
export const FETCH_ACTIVITY = "FETCH_ACTIVITY";
export const FETCH_RECENT_VIEWS = "FETCH_RECENT_VIEWS";

// action creators

export const fetchActivity = createThunkAction(FETCH_ACTIVITY, function() {
  return async function(dispatch, getState) {
    const activity = await ActivityApi.list();
    for (const ai of activity) {
      ai.timestamp = moment(ai.timestamp);
      ai.hasLinkableModel = function() {
        return _.contains(["card", "dashboard"], this.model);
      };
    }
    return activity;
  };
});

export const fetchRecentViews = createThunkAction(
  FETCH_RECENT_VIEWS,
  function() {
    return async function(dispatch, getState) {
      const recentViews = await ActivityApi.recent_views();
      for (const v of recentViews) {
        v.timestamp = moment(v.timestamp);
      }
      return recentViews;
    };
  },
);
