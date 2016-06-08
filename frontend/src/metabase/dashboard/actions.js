import _ from "underscore";

import { createAction } from "redux-actions";
import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";
import { normalize, Schema, arrayOf } from "normalizr";

import moment from "moment";
import { augmentDatabase } from "metabase/lib/table";

import MetabaseAnalytics from "metabase/lib/analytics";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";

const DATASET_SLOW_TIMEOUT   = 15 * 1000;
const DATASET_USUALLY_FAST_THRESHOLD = 15 * 1000;

// normalizr schemas
const dashcard = new Schema('dashcard');
const card = new Schema('card');
const dashboard = new Schema('dashboard');
dashboard.define({
  ordered_cards: arrayOf(dashcard)
});

// action constants
export const SELECT_DASHBOARD = 'SELECT_DASHBOARD';
export const SET_EDITING_DASHBOARD = 'SET_EDITING';

export const FETCH_CARDS = 'FETCH_CARDS';
export const DELETE_CARD = 'DELETE_CARD';

export const FETCH_DASHBOARD = 'FETCH_DASHBOARD';
export const SET_DASHBOARD_ATTRIBUTES = 'SET_DASHBOARD_ATTRIBUTES';
export const SET_DASHCARD_VISUALIZATION_SETTING = 'SET_DASHCARD_VISUALIZATION_SETTING';
export const SAVE_DASHBOARD = 'SAVE_DASHBOARD';
export const DELETE_DASHBOARD = 'DELETE_DASHBOARD';

export const ADD_CARD_TO_DASH = 'ADD_CARD_TO_DASH';
export const REMOVE_CARD_FROM_DASH = 'REMOVE_CARD_FROM_DASH';
export const SET_DASHCARD_ATTRIBUTES = 'SET_DASHCARD_ATTRIBUTES';
export const SAVE_DASHCARD = 'SAVE_DASHCARD';

export const FETCH_CARD_DATA = 'FETCH_CARD_DATA';
export const FETCH_CARD_DURATION = 'FETCH_CARD_DURATION';
export const FETCH_REVISIONS = 'FETCH_REVISIONS';
export const REVERT_TO_REVISION = 'REVERT_TO_REVISION';

export const MARK_NEW_CARD_SEEN = 'MARK_NEW_CARD_SEEN';

export const FETCH_DATABASE_METADATA = 'FETCH_DATABASE_METADATA';

// resource wrappers
const DashboardApi = new AngularResourceProxy("Dashboard", ["get", "update", "delete", "reposition_cards", "addcard", "removecard"]);
const MetabaseApi = new AngularResourceProxy("Metabase", ["dataset", "dataset_duration", "db_metadata"]);
const CardApi = new AngularResourceProxy("Card", ["list", "update", "delete"]);
const RevisionApi = new AngularResourceProxy("Revision", ["list", "revert"]);

// action creators

export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const markNewCardSeen = createAction(MARK_NEW_CARD_SEEN);

// these operations don't get saved to server immediately
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);

export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode = "all") {
    return async function(dispatch, getState) {
        let cards = await CardApi.list({ f: filterMode });
        for (var c of cards) {
            c.updated_at = moment(c.updated_at);
        }
        return normalize(cards, arrayOf(card));
    };
});

export const deleteCard = createThunkAction(DELETE_CARD, function(cardId) {
    return async function(dispatch, getState) {
        await CardApi.delete({ cardId });
        return cardId;
    };
});

export const addCardToDashboard = function({ dashId, cardId }) {
    return function(dispatch, getState) {
        var state = getState();
        var existingCards = state.dashboards[dashId].ordered_cards.map(id => state.dashcards[id]).filter(dc => !dc.isRemoved);
        let id = Math.random(); // temporary id
        dispatch(createAction(ADD_CARD_TO_DASH)({
            id: id,
            dashboard_id: dashId,
            card_id: cardId,
            card: state.cards[cardId],
            ...getPositionForNewDashCard(existingCards)
        }));
    };
}

export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

export const fetchCardData = createThunkAction(FETCH_CARD_DATA, function(card) {
    return async function(dispatch, getState) {
        let result = null;
        let slowCardTimer = setTimeout(() => {
            if (result === null) {
                dispatch(fetchCardDuration(card));
            }
        }, DATASET_SLOW_TIMEOUT);
        result = await MetabaseApi.dataset(card.dataset_query);
        clearTimeout(slowCardTimer);
        return { id: card.id, result };
    };
});

export const fetchCardDuration = createThunkAction(FETCH_CARD_DURATION, function(card) {
    return async function(dispatch, getState) {
        let result = await MetabaseApi.dataset_duration(card.dataset_query);
        return {
            id: card.id,
            result: {
                fast_threshold: DATASET_USUALLY_FAST_THRESHOLD,
                ...result
            }
        };
    };
});

export const fetchDashboard = createThunkAction(FETCH_DASHBOARD, function(id) {
    return async function(dispatch, getState) {
        let result = await DashboardApi.get({ dashId: id });
        return normalize(result, dashboard);
    };
});

export const saveDashboard = createThunkAction(SAVE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        let { dashboards, dashcards } = getState();
        let dashboard = {
            ...dashboards[dashId],
            ordered_cards: dashboards[dashId].ordered_cards.map(dashcardId => dashcards[dashcardId])
        };

        // remove isRemoved dashboards
        await Promise.all(dashboard.ordered_cards
            .filter(dc => dc.isRemoved && !dc.isAdded)
            .map(dc => DashboardApi.removecard({ dashId: dashboard.id, dashcardId: dc.id })));

        // add isAdded dashboards
        let updatedDashcards = await Promise.all(dashboard.ordered_cards
            .filter(dc => !dc.isRemoved)
            .map(async dc => {
                if (dc.isAdded) {
                    let result = await DashboardApi.addcard({ dashId, cardId: dc.card_id })
                    // mark isAdded because addcard doesn't record the position
                    return { ...result, col: dc.col, row: dc.row, sizeX: dc.sizeX, sizeY: dc.sizeY, series: dc.series, isAdded: true }
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
            let { id, name, description, public_perms } = dashboard;
            dashboard = await DashboardApi.update({ id, name, description, public_perms });
        }

        // reposition the cards
        if (_.some(updatedDashcards, (dc) => dc.isDirty || dc.isAdded)) {
            let cards = updatedDashcards.map(({ id, row, col, sizeX, sizeY, series }) => ({ id, row, col, sizeX, sizeY, series }));
            var result = await DashboardApi.reposition_cards({ dashId, cards });
            if (result.status !== "ok") {
                throw new Error(result.status);
            }
        }

        // make sure that we've fully cleared out any dirty state from editing (this is overkill, but simple)
        dispatch(fetchDashboard(dashId));

        MetabaseAnalytics.trackEvent("Dashboard", "Update");

        return dashboard;
    };
});

export const deleteDashboard = createThunkAction(DELETE_DASHBOARD, function(dashId) {
    return async function(dispatch, getState) {
        await DashboardApi.delete({ dashId });
        MetabaseAnalytics.trackEvent("Dashboard", "Delete");
        return dashId;
    };
});

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, function({ entity, id }) {
    return async function(dispatch, getState) {
        let revisions = await RevisionApi.list({ entity, id });
        return { entity, id, revisions };
    };
});

export const revertToRevision = createThunkAction(REVERT_TO_REVISION, function({ entity, id, revision_id }) {
    return async function(dispatch, getState) {
        await RevisionApi.revert({ entity, id, revision_id });
    };
});

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId) {
    return async function(dispatch, getState) {
        let databaseMetadata = await MetabaseApi.db_metadata({ dbId });
        augmentDatabase(databaseMetadata);
        return databaseMetadata;
    };
});

export const setDashCardVisualizationSetting = createAction(SET_DASHCARD_VISUALIZATION_SETTING);
