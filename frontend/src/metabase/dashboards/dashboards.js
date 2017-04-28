/* @flow weak */

import { handleActions, combineReducers, createThunkAction } from "metabase/lib/redux";
import MetabaseAnalytics from "metabase/lib/analytics";
import * as Urls from "metabase/lib/urls";
import { DashboardApi } from "metabase/services";
import { addUndo } from "metabase/redux/undo";

import React from "react";
import { push } from "react-router-redux";
import moment from 'moment';

import type { Dashboard } from "metabase/meta/types/Dashboard";

export const FETCH_DASHBOARDS = "metabase/dashboards/FETCH_DASHBOARDS";
export const FETCH_ARCHIVE    = "metabase/dashboards/FETCH_ARCHIVE";
export const CREATE_DASHBOARD = "metabase/dashboards/CREATE_DASHBOARD";
export const DELETE_DASHBOARD = "metabase/dashboards/DELETE_DASHBOARD";
export const SAVE_DASHBOARD   = "metabase/dashboards/SAVE_DASHBOARD";
export const UPDATE_DASHBOARD = "metabase/dashboards/UPDATE_DASHBOARD";
export const SET_FAVORITED    = "metabase/dashboards/SET_FAVORITED";
export const SET_ARCHIVED     = "metabase/dashboards/SET_ARCHIVED";

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

export const fetchArchivedDashboards = createThunkAction(FETCH_ARCHIVE, () =>
    async function(dispatch, getState) {
        const dashboards = await DashboardApi.list({f: "archived"})

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

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashboard: Dashboard) {
    return async function(dispatch, getState): Promise<Dashboard> {
        let { id, name, description, parameters } = dashboard
        MetabaseAnalytics.trackEvent("Dashboard", "Update");
        return await DashboardApi.update({ id, name, description, parameters });
    };
});

export type SetFavoritedAction = (dashId: number, favorited: boolean) => void;
export const setFavorited: SetFavoritedAction = createThunkAction(SET_FAVORITED, (dashId, favorited) => {
    return async (dispatch, getState) => {
        if (favorited) {
            await DashboardApi.favorite({ dashId });
        } else {
            await DashboardApi.unfavorite({ dashId });
        }
        MetabaseAnalytics.trackEvent("Dashboard", favorited ? "Favorite" : "Unfavorite");
        return { id: dashId, favorite: favorited };
    }
});

// A simplified version of a similar method in questions/questions.js
function createUndo(type, action) {
    return {
        type: type,
        count: 1,
        message: (undo) => // eslint-disable-line react/display-name
                <div> { "Dashboard was " + type + "."} </div>,
        actions: [action]
    };
}

export type SetArchivedAction = (dashId: number, archived: boolean, undoable?: boolean) => void;
export const setArchived = createThunkAction(SET_ARCHIVED, (dashId, archived, undoable = false) => {
    return async (dispatch, getState) => {
        const response = await DashboardApi.update({
            id: dashId,
            archived: archived
        });

        if (undoable) {
            dispatch(addUndo(createUndo(
                archived ? "archived" : "unarchived",
                setArchived(dashId, !archived)
            )));
        }

        MetabaseAnalytics.trackEvent("Dashboard", archived ? "Archive" : "Unarchive");
        return response;
    }
});
// Convenience shorthand
export const archiveDashboard = async (dashId) => await setArchived(dashId, true);

const archive = handleActions({
    [FETCH_ARCHIVE]: (state, { payload }) => payload,
    [SET_ARCHIVED]: (state, {payload}) => payload.archived
        ? (state || []).concat(payload)
        : (state || []).filter(d => d.id !== payload.id)
}, null);

const dashboardListing = handleActions({
    [FETCH_DASHBOARDS]: (state, { payload }) => payload,
    [CREATE_DASHBOARD]: (state, { payload }) => (state || []).concat(payload),
    [DELETE_DASHBOARD]: (state, { payload }) => (state || []).filter(d => d.id !== payload),
    [SAVE_DASHBOARD]:   (state, { payload }) => (state || []).map(d => d.id === payload.id ? payload : d),
    [UPDATE_DASHBOARD]: (state, { payload }) => (state || []).map(d => d.id === payload.id ? payload : d),
    [SET_FAVORITED]:    (state, { payload }) => (state || []).map(d => d.id === payload.id ? {...d, favorite: payload.favorite} : d),
    [SET_ARCHIVED]: (state, {payload}) => payload.archived
        ? (state || []).filter(d => d.id !== payload.id)
        : (state || []).concat(payload)
}, null);

export default combineReducers({
    dashboardListing,
    archive
});

