/*global ace*/
import React from 'react'
import { createAction } from "redux-actions";
import _ from "underscore";
import { assocIn } from "icepick";
import moment from "moment";

import { createThunkAction } from "metabase/lib/redux";
import { push, replace } from "react-router-redux";
import { setErrorPage } from "metabase/redux/app";

import MetabaseAnalytics from "metabase/lib/analytics";
import { loadCard, isCardDirty, startNewCard, deserializeCardFromUrl, serializeCardForUrl, cleanCopyCard, urlForCardState } from "metabase/lib/card";
import { formatSQL, humanize } from "metabase/lib/formatting";
import Query, { createQuery } from "metabase/lib/query";
import { isPK, isFK } from "metabase/lib/types";
import Utils from "metabase/lib/utils";
import { getEngineNativeType, formatJsonQuery } from "metabase/lib/engine";
import { defer } from "metabase/lib/promise";
import { addUndo } from "metabase/redux/undo";
import { applyParameters, cardIsEquivalent } from "metabase/meta/Card";

import { getParameters, getTableMetadata, getNativeDatabases } from "./selectors";
import { getDatabases, getTables, getDatabasesList } from "metabase/selectors/metadata";

import { fetchDatabases, fetchTableMetadata } from "metabase/redux/metadata";

import { MetabaseApi, CardApi, UserApi } from "metabase/services";

import { parse as urlParse } from "url";
import querystring from "querystring";

export const SET_CURRENT_STATE = "metabase/qb/SET_CURRENT_STATE"; const setCurrentState = createAction(SET_CURRENT_STATE);

export const POP_STATE = "metabase/qb/POP_STATE";
export const popState = createThunkAction(POP_STATE, (location) =>
    async (dispatch, getState) => {
        const { card } = getState().qb;
        if (location.state && location.state.card) {
            if (!Utils.equals(card, location.state.card)) {
                dispatch(setCardAndRun(location.state.card, false));
                dispatch(setCurrentState(location.state));
            }
        }
    }
);

export const CREATE_PUBLIC_LINK = "metabase/card/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(CREATE_PUBLIC_LINK, ({ id }) => CardApi.createPublicLink({ id }));

export const DELETE_PUBLIC_LINK = "metabase/card/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(DELETE_PUBLIC_LINK, ({ id }) => CardApi.deletePublicLink({ id }));

export const UPDATE_ENABLE_EMBEDDING = "metabase/card/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(UPDATE_ENABLE_EMBEDDING, ({ id }, enable_embedding) =>
    CardApi.update({ id, enable_embedding })
);

export const UPDATE_EMBEDDING_PARAMS = "metabase/card/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(UPDATE_EMBEDDING_PARAMS, ({ id }, embedding_params) =>
    CardApi.update({ id, embedding_params })
);

export const UPDATE_URL = "metabase/qb/UPDATE_URL";
export const updateUrl = createThunkAction(UPDATE_URL, (card, { dirty = false, replaceState = false, preserveParameters = true }) =>
    (dispatch, getState) => {
        if (!card) {
            return;
        }
        var copy = cleanCopyCard(card);
        var newState = {
            card: copy,
            cardId: copy.id,
            serializedCard: serializeCardForUrl(copy)
        };

        const { currentState } = getState().qb;

        if (Utils.equals(currentState, newState)) {
            return;
        }

        var url = urlForCardState(newState, dirty);

        // if the serialized card is identical replace the previous state instead of adding a new one
        // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
        replaceState = replaceState || (currentState && currentState.serializedCard === newState.serializedCard);

        const urlParsed = urlParse(url);
        const locationDescriptor = {
            pathname: urlParsed.pathname,
            search: preserveParameters ? window.location.search : "",
            hash: urlParsed.hash,
            state: newState
        };

        if (locationDescriptor.pathname === window.location.pathname &&
            (locationDescriptor.search || "") === (window.location.search || "") &&
            (locationDescriptor.hash || "") === (window.location.hash || "")
        ) {
            replaceState = true;
        }

        // this is necessary because we can't get the state from history.state
        dispatch(setCurrentState(newState));
        if (replaceState) {
            dispatch(replace(locationDescriptor));
        } else {
            dispatch(push(locationDescriptor));
        }
    }
);

export const RESET_QB = "metabase/qb/RESET_QB";
export const resetQB = createAction(RESET_QB);

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const initializeQB = createThunkAction(INITIALIZE_QB, (location, params) => {
    return async (dispatch, getState) => {
        // do this immediately to ensure old state is cleared before the user sees it
        dispatch(resetQB());
        dispatch(cancelQuery());

        const { currentUser } = getState();

        let card, databasesList, originalCard;
        let uiControls = {
            isEditing: false,
            isShowingTemplateTagsEditor: false
        };

        // always start the QB by loading up the databases for the application
        try {
            await dispatch(fetchDatabases());
            databasesList = getDatabasesList(getState());
        } catch(error) {
            console.error("error fetching dbs", error);

            // if we can't actually get the databases list then bail now
            dispatch(setErrorPage(error));

            return { uiControls };
        }

        // load up or initialize the card we'll be working on
        let options = {};
        let serializedCard;
        // hash can contain either query params starting with ? or a base64 serialized card
        if (location.hash) {
            let hash = location.hash.replace(/^#/, "");
            if (hash.charAt(0) === "?") {
                options = querystring.parse(hash.substring(1));
            } else {
                serializedCard = hash;
            }
        }
        const sampleDataset = _.findWhere(databasesList, { is_sample: true });

        let preserveParameters = false;
        if (params.cardId || serializedCard) {
            // existing card being loaded
            try {
                // if we have a serialized card then unpack it and use it
                card = serializedCard ? deserializeCardFromUrl(serializedCard) : {};

                // load the card either from `cardId` parameter or the serialized card
                if (params.cardId) {
                    card = await loadCard(params.cardId);
                    // when we are loading from a card id we want an explicit clone of the card we loaded which is unmodified
                    originalCard = Utils.copy(card);
                    // for showing the "started from" lineage correctly when adding filters/breakouts and when going back and forth
                    // in browser history, the original_card_id has to be set for the current card (simply the id of card itself for now)
                    card.original_card_id = card.id;
                } else if (card.original_card_id) {
                    // deserialized card contains the card id, so just populate originalCard
                    originalCard = await loadCard(card.original_card_id);
                    // if the cards are equal then show the original
                    if (cardIsEquivalent(card, originalCard)) {
                        card = Utils.copy(originalCard);
                    }
                }

                MetabaseAnalytics.trackEvent("QueryBuilder", "Query Loaded", card.dataset_query.type);

                // if we have deserialized card from the url AND loaded a card by id then the user should be dropped into edit mode
                uiControls.isEditing = !!options.edit;

                // if this is the users first time loading a saved card on the QB then show them the newb modal
                if (params.cardId && currentUser.is_qbnewb) {
                    uiControls.isShowingNewbModal = true;
                    MetabaseAnalytics.trackEvent("QueryBuilder", "Show Newb Modal");
                }

                if (card.archived) {
                    // use the error handler in App.jsx for showing "This question has been archived" message
                    dispatch(setErrorPage({
                        data: {
                            error_code: "archived"
                        },
                        context: "query-builder"
                    }));
                    card = null;
                }

                preserveParameters = true;
            } catch(error) {
                console.warn(error);
                card = null;
                dispatch(setErrorPage(error));
            }

        } else if (options.tutorial !== undefined && sampleDataset) {
            // we are launching the QB tutorial
            card = startNewCard("query", sampleDataset.id);

            uiControls.isShowingTutorial = true;
            MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Start", true);

        } else {
            // we are starting a new/empty card
            const databaseId = (options.db) ? parseInt(options.db) : (databasesList && databasesList.length > 0 && databasesList[0].id);

            card = startNewCard("query", databaseId);

            // initialize parts of the query based on optional parameters supplied
            if (options.table != undefined && card.dataset_query.query) {
                card.dataset_query.query.source_table = parseInt(options.table);
            }

            if (options.segment != undefined && card.dataset_query.query) {
                card.dataset_query.query.filter = ["AND", ["SEGMENT", parseInt(options.segment)]];
            }

            if (options.metric != undefined && card.dataset_query.query) {
                card.dataset_query.query.aggregation = ["METRIC", parseInt(options.metric)];
            }

            MetabaseAnalytics.trackEvent("QueryBuilder", "Query Started", card.dataset_query.type);
        }

        dispatch(loadMetadataForCard(card));

        // if we have loaded up a card that we can run then lets kick that off as well
        if (card && card.dataset_query && (Query.canRun(card.dataset_query.query) || card.dataset_query.type === "native")) {
            // NOTE: timeout to allow Parameters widget to set parameterValues
            setTimeout(() =>
                dispatch(runQuery(card, { shouldUpdateUrl: false }))
            , 0);
        }

        // clean up the url and make sure it reflects our card state
        dispatch(updateUrl(card, {
            dirty: isCardDirty(card, originalCard),
            replaceState: true,
            preserveParameters
        }));

        return {
            card,
            originalCard,
            uiControls
        };
    };
});


export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Toggle Data Reference");
});

export const TOGGLE_TEMPLATE_TAGS_EDITOR = "metabase/qb/TOGGLE_TEMPLATE_TAGS_EDITOR";
export const toggleTemplateTagsEditor = createAction(TOGGLE_TEMPLATE_TAGS_EDITOR, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Toggle Template Tags Editor");
});

export const CLOSE_QB_TUTORIAL = "metabase/qb/CLOSE_QB_TUTORIAL";
export const closeQbTutorial = createAction(CLOSE_QB_TUTORIAL, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Close");
});

export const CLOSE_QB_NEWB_MODAL = "metabase/qb/CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
    return async (dispatch, getState) => {
        // persist the fact that this user has seen the NewbModal
        const { currentUser } = getState();
        await UserApi.update_qbnewb({id: currentUser.id});
        MetabaseAnalytics.trackEvent('QueryBuilder', 'Close Newb Modal');
    };
});


export const BEGIN_EDITING = "metabase/qb/BEGIN_EDITING";
export const beginEditing = createAction(BEGIN_EDITING, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Begin");
});

export const CANCEL_EDITING = "metabase/qb/CANCEL_EDITING";
export const cancelEditing = createThunkAction(CANCEL_EDITING, () => {
    return (dispatch, getState) => {
        const { qb: { originalCard } } = getState();

        // clone
        let card = Utils.copy(originalCard);

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, { shouldUpdateUrl: false }));
        dispatch(updateUrl(card, { dirty: false }));

        MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Cancel");
        return card;
    };
});

export const LOAD_METADATA_FOR_CARD = "metabase/qb/LOAD_METADATA_FOR_CARD";
export const loadMetadataForCard = createThunkAction(LOAD_METADATA_FOR_CARD, (card) => {
    return async (dispatch, getState) => {
        // if we have a card with a known source table then dispatch an action to load up that info
        if (card && card.dataset_query && card.dataset_query.query && card.dataset_query.query.source_table != null) {
            dispatch(loadTableMetadata(card.dataset_query.query.source_table));
        }

        if (card && card.dataset_query && card.dataset_query.type === "native" && card.dataset_query.database != null) {
            dispatch(loadDatabaseFields(card.dataset_query.database));
        }
    }
});

export const LOAD_TABLE_METADATA = "metabase/qb/LOAD_TABLE_METADATA";
export const loadTableMetadata = createThunkAction(LOAD_TABLE_METADATA, (tableId) => {
    return async (dispatch, getState) => {
        try {
            await dispatch(fetchTableMetadata(tableId));
            // TODO: finish moving this to metadata duck:
            const foreignKeys = await MetabaseApi.table_fks({ tableId });
            return { foreignKeys }
        } catch(error) {
            console.error('error getting table metadata', error);
            return {};
        }
    };
});

export const LOAD_DATABASE_FIELDS = "metabase/qb/LOAD_DATABASE_FIELDS";
export const loadDatabaseFields = createThunkAction(LOAD_DATABASE_FIELDS, (dbId) => {
    return async (dispatch, getState) => {
        // if we already have the metadata loaded for the given table then we are done
        const { qb: { databaseFields } } = getState();
        try {
            let fields;
            if (databaseFields[dbId]) {
                fields = databaseFields[dbId];
            } else {
                fields = await MetabaseApi.db_fields({ dbId: dbId });
            }

            return {
                id: dbId,
                fields: fields
            };
        } catch(error) {
            console.error('error getting database fields', error);
            return {};
        }
    };
});

function updateVisualizationSettings(card, isEditing, display, vizSettings) {
    // don't need to store undefined
    vizSettings = Utils.copy(vizSettings)
    for (const name in vizSettings) {
        if (vizSettings[name] === undefined) {
            delete vizSettings[name];
        }
    }

    // make sure that something actually changed
    if (card.display === display && _.isEqual(card.visualization_settings, vizSettings)) return card;

    let updatedCard = Utils.copy(card);

    // when the visualization changes on saved card we change this into a new card w/ a known starting point
    if (!isEditing && updatedCard.id) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
    }

    updatedCard.display = display;
    updatedCard.visualization_settings = vizSettings;

    return updatedCard;
}

export const SET_CARD_ATTRIBUTE = "metabase/qb/SET_CARD_ATTRIBUTE";
export const setCardAttribute = createAction(SET_CARD_ATTRIBUTE, (attr, value) => ({attr, value}));

export const SET_CARD_VISUALIZATION = "metabase/qb/SET_CARD_VISUALIZATION";
export const setCardVisualization = createThunkAction(SET_CARD_VISUALIZATION, (display) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, display, card.visualization_settings);
        dispatch(updateUrl(updatedCard, { dirty: true }));
        return updatedCard;
    }
});

export const UPDATE_CARD_VISUALIZATION_SETTINGS = "metabase/qb/UPDATE_CARD_VISUALIZATION_SETTINGS";
export const updateCardVisualizationSettings = createThunkAction(UPDATE_CARD_VISUALIZATION_SETTINGS, (settings) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, card.display, { ...card.visualization_settings, ...settings });
        dispatch(updateUrl(updatedCard, { dirty: true }));
        return updatedCard;
    };
});

export const REPLACE_ALL_CARD_VISUALIZATION_SETTINGS = "metabase/qb/REPLACE_ALL_CARD_VISUALIZATION_SETTINGS";
export const replaceAllCardVisualizationSettings = createThunkAction(REPLACE_ALL_CARD_VISUALIZATION_SETTINGS, (settings) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, card.display, settings);
        dispatch(updateUrl(updatedCard, { dirty: true }));
        return updatedCard;
    };
});

export const UPDATE_TEMPLATE_TAG = "metabase/qb/UPDATE_TEMPLATE_TAG";
export const updateTemplateTag = createThunkAction(UPDATE_TEMPLATE_TAG, (templateTag) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();

        let updatedCard = Utils.copy(card);

        // when the query changes on saved card we change this into a new query w/ a known starting point
        if (!uiControls.isEditing && updatedCard.id) {
            delete updatedCard.id;
            delete updatedCard.name;
            delete updatedCard.description;
        }

        return assocIn(updatedCard, ["dataset_query", "native", "template_tags", templateTag.name], templateTag);
    };
});

export const SET_PARAMETER_VALUE = "metabase/qb/SET_PARAMETER_VALUE";
export const setParameterValue = createAction(SET_PARAMETER_VALUE, (parameterId, value) => {
    return { id: parameterId, value };
});

export const NOTIFY_CARD_CREATED = "metabase/qb/NOTIFY_CARD_CREATED";
export const notifyCardCreatedFn = createThunkAction(NOTIFY_CARD_CREATED, (card) => {
    return (dispatch, getState) => {
        dispatch(updateUrl(card, { dirty: false }));

        MetabaseAnalytics.trackEvent("QueryBuilder", "Create Card", card.dataset_query.type);

        return card;
    }
});

export const NOTIFY_CARD_UPDATED = "metabase/qb/NOTIFY_CARD_UPDATED";
export const notifyCardUpdatedFn = createThunkAction(NOTIFY_CARD_UPDATED, (card) => {
    return (dispatch, getState) => {
        dispatch(updateUrl(card, { dirty: false }));

        MetabaseAnalytics.trackEvent("QueryBuilder", "Update Card", card.dataset_query.type);

        return card;
    }
});

// reloadCard
export const RELOAD_CARD = "metabase/qb/RELOAD_CARD";
export const reloadCard = createThunkAction(RELOAD_CARD, () => {
    return async (dispatch, getState) => {
        const { qb: { originalCard } } = getState();

        // clone
        let card = Utils.copy(originalCard);

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, { shouldUpdateUrl: false }));
        dispatch(updateUrl(card, { dirty: false }));

        return card;
    };
});

// setCardAndRun
// Used when navigating browser history, when drilling through in visualizations / action widget,
// and when having the entity details view open and clicking its cells
export const SET_CARD_AND_RUN = "metabase/qb/SET_CARD_AND_RUN";
export const setCardAndRun = createThunkAction(SET_CARD_AND_RUN, (nextCard, shouldUpdateUrl = true) => {
    return async (dispatch, getState) => {
        // clone
        const card = Utils.copy(nextCard);

        const originalCard = card.original_card_id ?
            // If the original card id is present, dynamically load its information for showing lineage
            await loadCard(card.original_card_id)
            // Otherwise, use a current card as the original card if the card has been saved
            // This is needed for checking whether the card is in dirty state or not
            : (card.id ? card : null);

        dispatch(loadMetadataForCard(card));

        dispatch(runQuery(card, { shouldUpdateUrl: shouldUpdateUrl }));

        return {
            card,
            originalCard
        };
    };
});


// setDatasetQuery
export const SET_DATASET_QUERY = "metabase/qb/SET_DATASET_QUERY";
export const setDatasetQuery = createThunkAction(SET_DATASET_QUERY, (dataset_query, run = false) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();
        const databasesList = getDatabasesList(getState());

        const databaseId = card.dataset_query.database;
        const database = _.findWhere(databasesList, { id: databaseId });
        const supportsNativeParameters = database && _.contains(database.features, "native-parameters");

        let updatedCard = Utils.copy(card),
            openTemplateTagsEditor = uiControls.isShowingTemplateTagsEditor;

        // when the query changes on saved card we change this into a new query w/ a known starting point
        if (!uiControls.isEditing && updatedCard.id) {
            delete updatedCard.id;
            delete updatedCard.name;
            delete updatedCard.description;
        }

        updatedCard.dataset_query = Utils.copy(dataset_query);

        // special handling for NATIVE cards to automatically detect parameters ... {{varname}}
        if (Query.isNative(dataset_query) && !_.isEmpty(dataset_query.native.query) && supportsNativeParameters) {
            let tags = [];

            // look for variable usage in the query (like '{{varname}}').  we only allow alphanumeric characters for the variable name
            // a variable name can optionally end with :start or :end which is not considered part of the actual variable name
            // expected pattern is like mustache templates, so we are looking for something like {{category}} or {{date:start}}
            // anything that doesn't match our rule is ignored, so {{&foo!}} would simply be ignored
            let match, re = /\{\{([A-Za-z0-9_]+?)\}\}/g;
            while((match = re.exec(dataset_query.native.query)) != null) {
                tags.push(match[1]);
            }

            // eliminate any duplicates since it's allowed for a user to reference the same variable multiple times
            const existingTemplateTags = updatedCard.dataset_query.native.template_tags || {};

            tags = _.uniq(tags);
            let existingTags = Object.keys(existingTemplateTags);

            // if we ended up with any variables in the query then update the card parameters list accordingly
            if (tags.length > 0 || existingTags.length > 0) {
                let newTags = _.difference(tags, existingTags);
                let oldTags = _.difference(existingTags, tags);

                let templateTags = { ...existingTemplateTags };
                if (oldTags.length === 1 && newTags.length === 1) {
                    // renaming
                    templateTags[newTags[0]] = templateTags[oldTags[0]];

                    if (templateTags[newTags[0]].display_name === humanize(oldTags[0])) {
                        templateTags[newTags[0]].display_name = humanize(newTags[0])
                    }

                    templateTags[newTags[0]].name = newTags[0];
                    delete templateTags[oldTags[0]];
                } else {
                    // remove old vars
                    for (const name of oldTags) {
                        delete templateTags[name];
                    }

                    // create new vars
                    for (let tagName of newTags) {
                        templateTags[tagName] = {
                            id: Utils.uuid(),
                            name: tagName,
                            display_name: humanize(tagName),
                            type: null,
                        };
                    }
                }

                // ensure all tags have an id since we need it for parameter values to work
                for (const tag of Object.values(templateTags)) {
                    if (tag.id == undefined) {
                        tag.id = Utils.uuid();
                    }
                }

                updatedCard.dataset_query.native.template_tags = templateTags;

                if (newTags.length > 0) {
                    openTemplateTagsEditor = true;
                } else if (Object.keys(templateTags) === 0) {
                    openTemplateTagsEditor = false;
                }
            }
        }

        // run updated query
        if (run) {
            dispatch(runQuery(updatedCard));
        }

        return {
            card: updatedCard,
            openTemplateTagsEditor
        };
    };
});

// setQueryMode
export const SET_QUERY_MODE = "metabase/qb/SET_QUERY_MODE";
export const setQueryMode = createThunkAction(SET_QUERY_MODE, (type) => {
    return (dispatch, getState) => {
        const { qb: { card, queryResult, uiControls } } = getState();
        const tableMetadata = getTableMetadata(getState());

        // if the type didn't actually change then nothing has been modified
        if (type === card.dataset_query.type) {
            return card;
        }

        // if we are going from MBQL -> Native then attempt to carry over the query
        if (type === "native" && queryResult && queryResult.data && queryResult.data.native_form) {
            let updatedCard = Utils.copy(card);
            let datasetQuery = updatedCard.dataset_query;
            let nativeQuery = _.pick(queryResult.data.native_form, "query", "collection");

            // when the driver requires JSON we need to stringify it because it's been parsed already
            if (getEngineNativeType(tableMetadata.db.engine) === "json") {
                nativeQuery.query = formatJsonQuery(queryResult.data.native_form.query, tableMetadata.db.engine);
            } else {
                nativeQuery.query = formatSQL(nativeQuery.query);
            }

            datasetQuery.type = "native";
            datasetQuery.native = nativeQuery;
            delete datasetQuery.query;

            // when the query changes on saved card we change this into a new query w/ a known starting point
            if (!uiControls.isEditing && updatedCard.id) {
                delete updatedCard.id;
                delete updatedCard.name;
                delete updatedCard.description;
            }

            updatedCard.dataset_query = datasetQuery;

            dispatch(loadMetadataForCard(updatedCard));

            MetabaseAnalytics.trackEvent("QueryBuilder", "MBQL->Native");

            return updatedCard;

        // we are translating an empty query
        } else {
            let databaseId = card.dataset_query.database;

            // only carry over the database id if the user can write native queries
            if (type === "native") {
                let nativeDatabases = getNativeDatabases(getState());
                if (!_.findWhere(nativeDatabases, { id: databaseId })) {
                    databaseId = nativeDatabases.length > 0 ? nativeDatabases[0].id : null
                }
            }

            let newCard = startNewCard(type, databaseId);

            dispatch(loadMetadataForCard(newCard));

            return newCard;
        }
    };
});

// setQueryDatabase
export const SET_QUERY_DATABASE = "metabase/qb/SET_QUERY_DATABASE";
export const setQueryDatabase = createThunkAction(SET_QUERY_DATABASE, (databaseId) => {
    return async (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();
        const databases = getDatabases(getState());

        // picking the same database doesn't change anything
        if (databaseId === card.dataset_query.database) {
            return card;
        }

        let existingQuery = (card.dataset_query.native) ? card.dataset_query.native.query : undefined;
        if (!uiControls.isEditing) {
            let updatedCard = startNewCard(card.dataset_query.type, databaseId);
            if (existingQuery) {
                updatedCard.dataset_query.native.query = existingQuery;
                updatedCard.dataset_query.native.template_tags = card.dataset_query.native.template_tags;
            }

            // set the initial collection for the query if this is a native query
            // this is only used for Mongo queries which need to be ran against a specific collection
            if (updatedCard.dataset_query.type === 'native') {
                let database = databases[databaseId],
                    tables   = database ? database.tables : [],
                    table    = tables.length > 0 ? tables[0] : null;
                if (table) updatedCard.dataset_query.native.collection = table.name;
            }

            dispatch(loadMetadataForCard(updatedCard));

            return updatedCard;
        } else {
            // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
            // TODO: should this clear the visualization as well?
            let updatedCard = Utils.copy(card);
            updatedCard.dataset_query = createQuery(card.dataset_query.type, databaseId);
            if (existingQuery) {
                updatedCard.dataset_query.native.query = existingQuery;
                updatedCard.dataset_query.native.template_tags = card.dataset_query.native.template_tags;
            }

            dispatch(loadMetadataForCard(updatedCard));

            return updatedCard;
        }
    };
});

// setQuerySourceTable
export const SET_QUERY_SOURCE_TABLE = "metabase/qb/SET_QUERY_SOURCE_TABLE";
export const setQuerySourceTable = createThunkAction(SET_QUERY_SOURCE_TABLE, (sourceTable) => {
    return async (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();

        // this will either be the id or an object with an id
        const tableId = sourceTable.id || sourceTable;

        // if the table didn't actually change then nothing is modified
        if (tableId === card.dataset_query.query.source_table) {
            return card;
        }

        // load up all the table metadata via the api
        dispatch(loadTableMetadata(tableId));

        // find the database associated with this table
        let databaseId;
        if (_.isObject(sourceTable)) {
            databaseId = sourceTable.db_id;
        } else {
            const table = getTables(getState())[tableId];
            if (table) {
                databaseId = table.db_id;
            }
        }

        if (!uiControls.isEditing) {
            return startNewCard(card.dataset_query.type, databaseId, tableId);
        } else {
            // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
            // TODO: should this clear the visualization as well?
            let query = createQuery(card.dataset_query.type, databaseId, tableId);

            let updatedCard = Utils.copy(card);
            updatedCard.dataset_query = query;
            return updatedCard;
        }
    };
});

function createQueryAction(action, updaterFunction, event) {
    return createThunkAction(action, (...args) =>
        (dispatch, getState) => {
            const { qb: { card } } = getState();
            if (card.dataset_query.type === "query") {
                const datasetQuery = Utils.copy(card.dataset_query);
                updaterFunction(datasetQuery.query, ...args);
                dispatch(setDatasetQuery(datasetQuery));
                MetabaseAnalytics.trackEvent(...(typeof event === "function" ? event(...args) : event));
            }
            return null;
        }
    );
}

export const addQueryBreakout = createQueryAction(
    "metabase/qb/ADD_QUERY_BREAKOUT",
    Query.addBreakout,
    ["QueryBuilder", "Add GroupBy"]
);
export const updateQueryBreakout = createQueryAction(
    "metabase/qb/UPDATE_QUERY_BREAKOUT",
    Query.updateBreakout,
    ["QueryBuilder", "Modify GroupBy"]
);
export const removeQueryBreakout = createQueryAction(
    "metabase/qb/REMOVE_QUERY_BREAKOUT",
    Query.removeBreakout,
    ["QueryBuilder", "Remove GroupBy"]
);
export const addQueryFilter = createQueryAction(
    "metabase/qb/ADD_QUERY_FILTER",
    Query.addFilter,
    ["QueryBuilder", "Add Filter"]
);
export const updateQueryFilter = createQueryAction(
    "metabase/qb/UPDATE_QUERY_FILTER",
    Query.updateFilter,
    ["QueryBuilder", "Modify Filter"]
);
export const removeQueryFilter = createQueryAction(
    "metabase/qb/REMOVE_QUERY_FILTER",
    Query.removeFilter,
    ["QueryBuilder", "Remove Filter"]
);
export const addQueryAggregation = createQueryAction(
    "metabase/qb/ADD_QUERY_AGGREGATION",
    Query.addAggregation,
    ["QueryBuilder", "Add Aggregation"]
);
export const updateQueryAggregation = createQueryAction(
    "metabase/qb/UPDATE_QUERY_AGGREGATION",
    Query.updateAggregation,
    ["QueryBuilder", "Set Aggregation"]
);
export const removeQueryAggregation = createQueryAction(
    "metabase/qb/REMOVE_QUERY_AGGREGATION",
    Query.removeAggregation,
    ["QueryBuilder", "Remove Aggregation"]
);
export const addQueryOrderBy = createQueryAction(
    "metabase/qb/ADD_QUERY_ORDER_BY",
    Query.addOrderBy,
    ["QueryBuilder", "Add OrderBy"]
);
export const updateQueryOrderBy = createQueryAction(
    "metabase/qb/UPDATE_QUERY_ORDER_BY",
    Query.updateOrderBy,
    ["QueryBuilder", "Set OrderBy"]
);
export const removeQueryOrderBy = createQueryAction(
    "metabase/qb/REMOVE_QUERY_ORDER_BY",
    Query.removeOrderBy,
    ["QueryBuilder", "Remove OrderBy"]
);
export const updateQueryLimit = createQueryAction(
    "metabase/qb/UPDATE_QUERY_LIMIT",
    Query.updateLimit,
    ["QueryBuilder", "Update Limit"]
);
export const addQueryExpression = createQueryAction(
    "metabase/qb/ADD_QUERY_EXPRESSION",
    Query.addExpression,
    ["QueryBuilder", "Add Expression"]
);
export const updateQueryExpression = createQueryAction(
    "metabase/qb/UPDATE_QUERY_EXPRESSION",
    Query.updateExpression,
    ["QueryBuilder", "Set Expression"]
);
export const removeQueryExpression = createQueryAction(
    "metabase/qb/REMOVE_QUERY_EXPRESSION",
    Query.removeExpression,
    ["QueryBuilder", "Remove Expression"]
);

// runQuery
export const RUN_QUERY = "metabase/qb/RUN_QUERY";
export const runQuery = createThunkAction(RUN_QUERY, (card, {
    shouldUpdateUrl = true,
    ignoreCache = false, // currently only implemented for saved cards
    parameterValues
} = {}) => {
    return async (dispatch, getState) => {
        const state = getState();
        const parameters = getParameters(state);

        // if we got a query directly on the action call then use it, otherwise take whatever is in our current state
        card = card || state.qb.card;
        parameterValues = parameterValues || state.qb.parameterValues || {};

        const cardIsDirty = isCardDirty(card, state.qb.originalCard);

        if (shouldUpdateUrl) {
            dispatch(updateUrl(card, { dirty: cardIsDirty }));
        }

        let cancelQueryDeferred = defer();
        const startTime = new Date();

        // make our api call
        function onQuerySuccess(queryResult) {
            dispatch(queryCompleted(card, queryResult));
        }

        function onQueryError(error) {
            dispatch(queryErrored(startTime, error));
        }

        const datasetQuery = applyParameters(card, parameters, parameterValues);

        // use the CardApi.query if the query is saved and not dirty so users with view but not create permissions can see it.
        if (card.id != null && !cardIsDirty) {
            CardApi.query({
                cardId: card.id,
                parameters: datasetQuery.parameters,
                ignore_cache: ignoreCache
            }, { cancelled: cancelQueryDeferred.promise }).then(onQuerySuccess, onQueryError);
        } else {
            MetabaseApi.dataset(datasetQuery, { cancelled: cancelQueryDeferred.promise }).then(onQuerySuccess, onQueryError);
        }

        MetabaseAnalytics.trackEvent("QueryBuilder", "Run Query", card.dataset_query.type);

        // HACK: prevent SQL editor from losing focus
        try { ace.edit("id_sql").focus() } catch (e) {}

        return cancelQueryDeferred;
    };
});

export const QUERY_COMPLETED = "metabase/qb/QUERY_COMPLETED";
export const queryCompleted = createThunkAction(QUERY_COMPLETED, (card, queryResult) => {
    return async (dispatch, getState) => {
        let cardDisplay = card.display;

        // try a little logic to pick a smart display for the data
        // TODO: less hard-coded rules for picking chart type
        const isScalarVisualization = card.display === "scalar" || card.display === "progress";
        if (!isScalarVisualization &&
                queryResult.data.rows &&
                queryResult.data.rows.length === 1 &&
                queryResult.data.cols.length === 1) {
            // if we have a 1x1 data result then this should always be viewed as a scalar
            cardDisplay = "scalar";

        } else if (isScalarVisualization &&
                    queryResult.data.rows &&
                    (queryResult.data.rows.length > 1 || queryResult.data.cols.length > 1)) {
            // any time we were a scalar and now have more than 1x1 data switch to table view
            cardDisplay = "table";

        } else if (!card.display) {
            // if our query aggregation is "rows" then ALWAYS set the display to "table"
            cardDisplay = "table";
        }

        return {
            card,
            cardDisplay,
            queryResult
        }
    };
});

export const QUERY_ERRORED = "metabase/qb/QUERY_ERRORED";
export const queryErrored = createThunkAction(QUERY_ERRORED, (startTime, error) => {
    return async (dispatch, getState) => {
        if (error && error.status === 0) {
            // cancelled, do nothing
            return null;
        } else {
            return { error: error, duration: new Date() - startTime };
        }
    }
})

// cancelQuery
export const CANCEL_QUERY = "metabase/qb/CANCEL_QUERY";
export const cancelQuery = createThunkAction(CANCEL_QUERY, () => {
    return async (dispatch, getState) => {
        const { qb: { uiControls, queryExecutionPromise } } = getState();

        if (uiControls.isRunning && queryExecutionPromise) {
            queryExecutionPromise.resolve();
        }
    };
});

// cellClicked
export const CELL_CLICKED = "metabase/qb/CELL_CLICKED";
export const cellClicked = createThunkAction(CELL_CLICKED, (rowIndex, columnIndex, filter) => {
    return async (dispatch, getState) => {
        const { qb: { card, queryResult } } = getState();
        if (!queryResult) return false;

        // lookup the coldef and cell value of the cell we are taking action on
        var coldef          = queryResult.data.cols[columnIndex],
            value           = queryResult.data.rows[rowIndex][columnIndex],
            sourceTableID   = card.dataset_query.query.source_table,
            isForeignColumn = coldef.table_id && coldef.table_id !== sourceTableID && coldef.fk_field_id,
            fieldRefForm    = isForeignColumn ? ['fk->', coldef.fk_field_id, coldef.id] : ['field-id', coldef.id];

        if (isPK(coldef.special_type)) {
            // action is on a PK column
            let newCard: Card = startNewCard("query", card.dataset_query.database);

            newCard.dataset_query.query.source_table = coldef.table_id;
            newCard.dataset_query.query.aggregation = ["rows"];
            newCard.dataset_query.query.filter = ["AND", ["=", coldef.id, value]];

            // run it
            dispatch(setCardAndRun(newCard));

            MetabaseAnalytics.trackEvent("QueryBuilder", "Table Cell Click", "PK");
        } else if (isFK(coldef.special_type)) {
            // action is on an FK column
            let newCard = startNewCard("query", card.dataset_query.database);

            newCard.dataset_query.query.source_table = coldef.target.table_id;
            newCard.dataset_query.query.aggregation = ["rows"];
            newCard.dataset_query.query.filter = ["AND", ["=", coldef.target.id, value]];

            // run it
            dispatch(setCardAndRun(newCard));

            MetabaseAnalytics.trackEvent("QueryBuilder", "Table Cell Click", "FK");
        } else {
            // this is applying a filter by clicking on a cell value
            let dataset_query = Utils.copy(card.dataset_query);

            if (coldef.unit && coldef.unit != "default" && filter === "=") {
                // this is someone using quick filters on a datetime value
                let start = moment(value).format("YYYY-MM-DD");
                let end = start;
                switch(coldef.unit) {
                    case "week": end = moment(value).add(1, "weeks").subtract(1, "days").format("YYYY-MM-DD"); break;
                    case "month": end = moment(value).add(1, "months").subtract(1, "days").format("YYYY-MM-DD"); break;
                    case "quarter": end = moment(value).add(1, "quarters").subtract(1, "days").format("YYYY-MM-DD"); break;
                    case "year": start = moment(value, "YYYY").format("YYYY-MM-DD");
                                 end = moment(value, "YYYY").add(1, "years").subtract(1, "days").format("YYYY-MM-DD"); break;
                }
                Query.addFilter(dataset_query.query, ["BETWEEN", fieldRefForm, start, end]);
            } else {
                // quick filtering on a normal value (string/number)
                Query.addFilter(dataset_query.query, [filter, fieldRefForm, value]);
            }

            // update and run the query
            dispatch(setDatasetQuery(dataset_query, true));

            MetabaseAnalytics.trackEvent("QueryBuilder", "Table Cell Click", "Quick Filter");
        }
    };
});

export const FOLLOW_FOREIGN_KEY = "metabase/qb/FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(FOLLOW_FOREIGN_KEY, (fk) => {
    return async (dispatch, getState) => {
        const { qb: { card, queryResult } } = getState();

        if (!queryResult || !fk) return false;

        // extract the value we will use to filter our new query
        var originValue;
        for (var i=0; i < queryResult.data.cols.length; i++) {
            if (isPK(queryResult.data.cols[i].special_type)) {
                originValue = queryResult.data.rows[0][i];
            }
        }

        // action is on an FK column
        let newCard = startNewCard("query", card.dataset_query.database);

        newCard.dataset_query.query.source_table = fk.origin.table.id;
        newCard.dataset_query.query.aggregation = ["rows"];
        newCard.dataset_query.query.filter = ["AND", ["=", fk.origin.id, originValue]];

        // run it
        dispatch(setCardAndRun(newCard));
    };
});


export const LOAD_OBJECT_DETAIL_FK_REFERENCES = "metabase/qb/LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const loadObjectDetailFKReferences = createThunkAction(LOAD_OBJECT_DETAIL_FK_REFERENCES, () => {
    return async (dispatch, getState) => {
        const { qb: { card, queryResult, tableForeignKeys } } = getState();

        function getObjectDetailIdValue(data) {
            for (var i=0; i < data.cols.length; i++) {
                var coldef = data.cols[i];
                if (isPK(coldef.special_type)) {
                    return data.rows[0][i];
                }
            }
        }

        async function getFKCount(card, queryResult, fk) {
            let fkQuery = createQuery("query");
            fkQuery.database = card.dataset_query.database;
            fkQuery.query.source_table = fk.origin.table_id;
            fkQuery.query.aggregation = ["count"];
            fkQuery.query.filter = ["AND", ["=", fk.origin.id, getObjectDetailIdValue(queryResult.data)]];

            let info = {"status": 0, "value": null};

            try {
                let result = await MetabaseApi.dataset(fkQuery);
                if (result && result.status === "completed" && result.data.rows.length > 0) {
                    info["value"] = result.data.rows[0][0];
                } else {
                    info["value"] = "Unknown";
                }
            } catch (error) {
                console.error("error getting fk count", error, fkQuery);
            } finally {
                info["status"] = 1;
            }

            return info;
        }

        // TODO: there are possible cases where running a query would not require refreshing this data, but
        // skipping that for now because it's easier to just run this each time

        // run a query on FK origin table where FK origin field = objectDetailIdValue
        let fkReferences = {};
        for (let i=0; i < tableForeignKeys.length; i++) {
            let fk = tableForeignKeys[i],
                info = await getFKCount(card, queryResult, fk);
            fkReferences[fk.origin.id] = info;
        }

        return fkReferences;
    };
});

// TODO - this is pretty much a duplicate of SET_ARCHIVED in questions/questions.js
// unfortunately we have to do this because that action relies on its part of the store
// for the card lookup
// A simplified version of a similar method in questions/questions.js
function createUndo(type, action) {
    return {
        type: type,
        count: 1,
        message: (undo) => // eslint-disable-line react/display-name
                <div> { "Question  was " + type + "."} </div>,
        actions: [action]
    };
}

export const ARCHIVE_QUESTION = 'metabase/qb/ARCHIVE_QUESTION';
export const archiveQuestion = createThunkAction(ARCHIVE_QUESTION, (questionId, archived = true) =>
    async (dispatch, getState) => {
        let card = {
            ...getState().qb.card, // grab the current card
            archived
        }
        let response = await CardApi.update(card)

        dispatch(addUndo(createUndo(
            archived ? "archived" : "unarchived",
            archiveQuestion(card.id, !archived)
        )));

        dispatch(push('/questions'))
        return response
    }
)



// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const toggleDataReferenceFn = toggleDataReference;
export const onBeginEditing = beginEditing;
export const onCancelEditing = cancelEditing;
export const setQueryModeFn = setQueryMode;
export const setDatabaseFn = setQueryDatabase;
export const setSourceTableFn = setQuerySourceTable;
export const setDisplayFn = setCardVisualization;
export const onSetCardAttribute = setCardAttribute;
export const reloadCardFn = reloadCard;
export const onRestoreOriginalQuery = reloadCard;
export const onUpdateVisualizationSettings = updateCardVisualizationSettings;
export const onReplaceAllVisualizationSettings = replaceAllCardVisualizationSettings;
export const cellClickedFn = cellClicked;
export const followForeignKeyFn = followForeignKey;
