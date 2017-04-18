/* @flow weak */

import { handleActions, createAction, combineReducers, createThunkAction } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
import MetabaseAnalytics from "metabase/lib/analytics";
import moment from 'moment';

import * as Urls from "metabase/lib/urls";
import { push } from "react-router-redux";
import type { Dashboard } from "metabase/meta/types/Dashboard";

export const FETCH_DASHBOARDS = "metabase/dashboards/FETCH_DASHBOARDS";
export const CREATE_DASHBOARD = "metabase/dashboards/CREATE_DASHBOARD";
export const DELETE_DASHBOARD = "metabase/dashboards/DELETE_DASHBOARD";
export const SAVE_DASHBOARD = "metabase/dashboards/SAVE_DASHBOARD";
export const UPDATE_DASHBOARD = "metabase/dashboards/UPDATE_DASHBOARD";

/**
 * Actions that retrieve/update the basic information of dashboards
 * `dashboards.dashboardListing` holds an array of all dashboards without cards
 */

export const fetchDashboards = createThunkAction(FETCH_DASHBOARDS, () =>
    async function(dispatch, getState) {
        const dashboards = await DashboardApi.list({f: "all"})

        for (const dashboard of dashboards) {
            dashboard.updated_at = moment(dashboard.updated_at);
        }

        return dashboards;
    }
);

type CreateDashboardOpts = {
    redirect?: boolean
}
export const createDashboard = createThunkAction(CREATE_DASHBOARD, (dashboard: Dashboard, { redirect }: CreateDashboardOpts) =>
    async (dispatch, getState) => {
        MetabaseAnalytics.trackEvent("Dashboard", "Create");
        const createdDashboard: Dashboard = await DashboardApi.create(dashboard);

        if (redirect) {
            dispatch(push(Urls.dashboard(createdDashboard.id)));
        }

        return createdDashboard;
    }
);

export const updateDashboard = createThunkAction(UPDATE_DASHBOARD, (dashboard: Dashboard) =>
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
    return async function(dispatch, getState): Promise<Dashboard> {
        let { id, name, description, parameters } = dashboard
        MetabaseAnalytics.trackEvent("Dashboard", "Update");
        return await DashboardApi.update({ id, name, description, parameters });
    };
});

const dashboardListing = handleActions({
    [FETCH_DASHBOARDS]: (state, { payload }) => payload,
    [CREATE_DASHBOARD]: (state, { payload }) => (state || []).concat(payload),
    [DELETE_DASHBOARD]: (state, { payload }) => (state || []).filter(d => d.id !== payload),
    [SAVE_DASHBOARD]:   (state, { payload }) => (state || []).map(d => d.id === payload.id ? payload : d),
    [UPDATE_DASHBOARD]: (state, { payload }) => (state || []).map(d => d.id === payload.id ? payload : d),
}, null);

export default combineReducers({
    dashboardListing
});

