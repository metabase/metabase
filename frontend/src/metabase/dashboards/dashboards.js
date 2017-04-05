/* @flow weak */

import { handleActions, createAction, combineReducers, createThunkAction } from "metabase/lib/redux";
import { DashboardApi, CardApi } from "metabase/services";
import MetabaseAnalytics from "metabase/lib/analytics";

import _ from "underscore";

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

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashboard) {
    return async function(dispatch, getState) {
        // remove isRemoved dashboards
        await Promise.all(dashboard.ordered_cards
            .filter(dc => dc.isRemoved && !dc.isAdded)
            .map(dc => DashboardApi.removecard({ dashId: dashboard.id, dashcardId: dc.id })));

        // add isAdded dashboards
        let updatedDashcards = await Promise.all(dashboard.ordered_cards
            .filter(dc => !dc.isRemoved)
            .map(async dc => {
                if (dc.isAdded) {
                    let result = await DashboardApi.addcard({ dashId: dashboard.id, cardId: dc.card_id });
                    // TODO Figure out what to do with updateDashcardId; we are not really into a circular dependency with Dashboard.js
                    // dispatch(updateDashcardId(dc.id, result.id));
                    // mark isAdded because addcard doesn't record the position
                    return {
                        ...result,
                        col: dc.col, row: dc.row,
                        sizeX: dc.sizeX, sizeY: dc.sizeY,
                        series: dc.series,
                        parameter_mappings: dc.parameter_mappings,
                        visualization_settings: dc.visualization_settings,
                        isAdded: true
                    }
                } else {
                    return dc;
                }
            }));

        // update modified cards
        await Promise.all(dashboard.ordered_cards
            .filter(dc => dc.card.isDirty)
            .map(async dc => CardApi.update(dc.card)));

        // update the dashboard itself
        if (dashboard.isDirty) {
            let { id, name, description, parameters } = dashboard;
            dashboard = await DashboardApi.update({ id, name, description, parameters });
        }

        // reposition the cards
        if (_.some(updatedDashcards, (dc) => dc.isDirty || dc.isAdded)) {
            let cards = updatedDashcards.map(({ id, card_id, row, col, sizeX, sizeY, series, parameter_mappings, visualization_settings }) =>
                ({
                    id, card_id, row, col, sizeX, sizeY, series, visualization_settings,
                    parameter_mappings: parameter_mappings && parameter_mappings.filter(mapping =>
                            // filter out mappings for deleted paramters
                        _.findWhere(dashboard.parameters, { id: mapping.parameter_id }) &&
                        // filter out mappings for deleted series
                        (card_id === mapping.card_id || _.findWhere(series, { id: mapping.card_id }))
                    )
                })
            );
            var result = await DashboardApi.reposition_cards({ dashId: dashboard.id, cards });
            if (result.status !== "ok") {
                throw new Error(result.status);
            }
        }

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return dashboard;
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

