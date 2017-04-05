/* @flow weak */

import { handleActions, createAction, combineReducers, createThunkAction } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
import MetabaseAnalytics from "metabase/lib/analytics";

import type { Dashboard } from "metabase/meta/types/Dashboard";

export const FETCH_DASHBOARDS = "metabase/dashboards/FETCH_DASHBOARDS";
export const CREATE_DASHBOARD = "metabase/dashboards/CREATE_DASHBOARD";
export const DELETE_DASHBOARD = "metabase/dashboards/DELETE_DASHBOARD";
export const SAVE_DASHBOARD = "metabase/dashboards/SAVE_DASHBOARD";
export const UPDATE_DASHBOARD = "metabase/dashboards/UPDATE_DASHBOARD";

export const fetchDashboards = createAction(FETCH_DASHBOARDS, () =>
    DashboardApi.list({ f: "all" })
);

export const createDashboard = createAction(CREATE_DASHBOARD, (newDashboard) => {
    MetabaseAnalytics.trackEvent("Dashboard", "Create");
    return DashboardApi.create(newDashboard);
});

export const updateDashboardReferenceFields = createThunkAction(UPDATE_DASHBOARD, (dashboard) =>
    async (dispatch, getState) => {
        const {
            id,
            name,
            description,
            parameters,
            caveats,
            points_of_interest,
            show_in_getting_started
        } = dashboard;

        const cleanDashboard = {
            id,
            name,
            description,
            parameters,
            caveats,
            points_of_interest,
            show_in_getting_started
        };

        const updatedDashboard = await DashboardApi.update(cleanDashboard);

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return updatedDashboard;
    }
);

export const deleteDashboard = createAction(DELETE_DASHBOARD, async (dashId) => {
    MetabaseAnalytics.trackEvent("Dashboard", "Delete");
    await DashboardApi.delete({ dashId });
    return dashId;
});

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashboard: Dashboard) {
    return async function(dispatch, getState) {
        let { id, name, description, parameters } = dashboard
        MetabaseAnalytics.trackEvent("Dashboard", "Update");
        return await DashboardApi.update({ id, name, description, parameters });
    };
});

const dashboardListing = handleActions({
    [FETCH_DASHBOARDS]: (state, { payload }) => payload,
    [CREATE_DASHBOARD]: (state, { payload }) => state.concat(payload),
    [DELETE_DASHBOARD]: (state, { payload }) => state.filter(d => d.id !== payload),
    [SAVE_DASHBOARD]:   (state, { payload }) => state.map(d => d.id === payload.id ? payload : d),
    [UPDATE_DASHBOARD]: (state, { payload }) => state.map(d => d.id === payload.id ? payload : d),
}, []);

export default combineReducers({
    dashboardListing
});

