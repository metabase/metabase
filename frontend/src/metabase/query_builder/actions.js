/*global ace*/

import { createAction } from "redux-actions";
import _ from "underscore";
import i from "icepick";
import moment from "moment";

import { AngularResourceProxy, angularPromise, createThunkAction } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { loadCard, isCardDirty, startNewCard, deserializeCardFromUrl } from "metabase/lib/card";
import { formatSQL, humanize } from "metabase/lib/formatting";
import Query from "metabase/lib/query";
import { createQuery } from "metabase/lib/query";
import { loadTableAndForeignKeys } from "metabase/lib/table";
import Utils from "metabase/lib/utils";

import { getParameters } from "./selectors";

const Metabase = new AngularResourceProxy("Metabase", ["db_list_with_tables", "db_fields", "dataset", "table_query_metadata"]);
const User = new AngularResourceProxy("User", ["update_qbnewb"]);


export const INITIALIZE_QB = "INITIALIZE_QB";
export const initializeQB = createThunkAction(INITIALIZE_QB, (updateUrl) => {
    return async (dispatch, getState) => {
        const { router: { location, params: { cardId } }, currentUser } = getState();

        let card, databases, originalCard, uiControls = {};

        // always start the QB by loading up the databases for the application
        try {
            databases = await Metabase.db_list_with_tables();
        } catch(error) {
            console.log("error fetching dbs", error);

            // if we can't actually get the databases list then bail now
            return {
                uiControls: {
                    is500: true
                }
            }
        }

        // load up or initialize the card we'll be working on
        const serializedCard = location.hash || null;
        const sampleDataset = _.findWhere(databases, { is_sample: true });
        if (cardId || serializedCard) {
            // existing card being loaded
            try {
                if (cardId) {
                    card = await loadCard(cardId);

                    // when we are loading from a card id we want an explict clone of the card we loaded which is unmodified
                    originalCard = JSON.parse(JSON.stringify(card));
                }

                // if we have a serialized card then unpack it and use it
                if (serializedCard) {
                    let deserializedCard = deserializeCardFromUrl(serializedCard);
                    card = card ? _.extend(card, deserializedCard) : deserializedCard;
                }

                MetabaseAnalytics.trackEvent("QueryBuilder", "Query Loaded", card.dataset_query.type);

                // if we have deserialized card from the url AND loaded a card by id then the user should be dropped into edit mode
                uiControls.isEditing = (location.query.edit || (cardId && serializedCard)) ? true : false;

                // if this is the users first time loading a saved card on the QB then show them the newb modal
                if (cardId && currentUser.is_qbnewb) {
                    uiControls.isShowingNewbModal = true;
                    MetabaseAnalytics.trackEvent("QueryBuilder", "Show Newb Modal");
                }
            } catch(error) {
                console.warn(error)
                card = null;

                if (error.status === 404) {
                    uiControls.is404 = true;
                } else {
                    uiControls.is500 = true;
                }
            }

        } else if (location.query.tutorial && sampleDataset) {
            // we are launching the QB tutorial
            card = startNewCard("query", sampleDataset.id);

            uiControls.isShowingTutorial = true;
            MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Start", true);

        } else {
            // we are starting a new/empty card
            const databaseId = (location.query.db) ? parseInt(location.query.db) : (databases && databases.length > 0 && databases[0].id);

            card = startNewCard("query", databaseId);

            // initialize parts of the query based on optional parameters supplied
            if (location.query.table != undefined && card.dataset_query.query) {
                card.dataset_query.query.source_table = parseInt(location.query.table);
            }

            if (location.query.segment != undefined && card.dataset_query.query) {
                card.dataset_query.query.filter = ["AND", ["SEGMENT", parseInt(location.query.segment)]];
            }

            if (location.query.metric != undefined && card.dataset_query.query) {
                card.dataset_query.query.aggregation = ["METRIC", parseInt(location.query.metric)];
            }

            MetabaseAnalytics.trackEvent("QueryBuilder", "Query Started", card.dataset_query.type);
        }


        dispatch(loadMetadataForCard(card));

        // if we have loaded up a card that we can run then lets kick that off as well
        if (card && card.dataset_query && (Query.canRun(card.dataset_query.query) || card.dataset_query.type === "native")) {
            dispatch(runQuery(card, false));
        }

        // clean up the url and make sure it reflects our card state
        updateUrl(card, isCardDirty(card, originalCard));

        return {
            card,
            originalCard,
            databases,
            uiControls,
            updateUrl
        };
    };
});


export const TOGGLE_DATA_REFERENCE = "TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE);

export const TOGGLE_TEMPLATE_TAGS_EDITOR = "TOGGLE_TEMPLATE_TAGS_EDITOR";
export const toggleTemplateTagsEditor = createAction(TOGGLE_TEMPLATE_TAGS_EDITOR);

export const CLOSE_QB_TUTORIAL = "CLOSE_QB_TUTORIAL";
export const closeQbTutorial = createAction(CLOSE_QB_TUTORIAL, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Close");
});

export const CLOSE_QB_NEWB_MODAL = "CLOSE_QB_NEWB_MODAL";
export const closeQbNewbModal = createThunkAction(CLOSE_QB_NEWB_MODAL, () => {
    return async (dispatch, getState) => {
        // persist the fact that this user has seen the NewbModal
        const { currentUser } = getState();
        await User.update_qbnewb({id: currentUser.id});
        MetabaseAnalytics.trackEvent('QueryBuilder', 'Close Newb Modal');
    };
});


export const BEGIN_EDITING = "BEGIN_EDITING";
export const beginEditing = createAction(BEGIN_EDITING, () => {
    MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Begin");
});

export const CANCEL_EDITING = "CANCEL_EDITING";
export const cancelEditing = createThunkAction(CANCEL_EDITING, () => {
    return (dispatch, getState) => {
        const { qb: { originalCard, updateUrl } } = getState();

        // clone
        let card = JSON.parse(JSON.stringify(originalCard));

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, false));
        updateUrl(card, false);

        MetabaseAnalytics.trackEvent("QueryBuilder", "Edit Cancel");
        return card;
    };
});

export const LOAD_METADATA_FOR_CARD = "LOAD_METADATA_FOR_CARD";
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

export const LOAD_TABLE_METADATA = "LOAD_TABLE_METADATA";
export const loadTableMetadata = createThunkAction(LOAD_TABLE_METADATA, (tableId) => {
    return async (dispatch, getState) => {
        // if we already have the metadata loaded for the given table then we are done
        const { qb: { tableMetadata } } = getState();
        if (tableMetadata && tableMetadata.id === tableId) {
            return tableMetadata;
        }

        try {
            return await loadTableAndForeignKeys(tableId);
        } catch(error) {
            console.log('error getting table metadata', error);
            return {};
        }
    };
});

export const LOAD_DATABASE_FIELDS = "LOAD_DATABASE_FIELDS";
export const loadDatabaseFields = createThunkAction(LOAD_DATABASE_FIELDS, (dbId) => {
    return async (dispatch, getState) => {
        // if we already have the metadata loaded for the given table then we are done
        const { qb: { databaseFields } } = getState();
        try {
            let fields;
            if (databaseFields[dbId]) {
                fields = databaseFields[dbId];
            } else {
                fields = await Metabase.db_fields({ dbId: dbId });
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
    // make sure that something actually changed
    if (card.display === display && _.isEqual(card.visualization_settings, vizSettings)) return card;

    let updatedCard = JSON.parse(JSON.stringify(card));

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

export const SET_CARD_ATTRIBUTE = "SET_CARD_ATTRIBUTE";
export const setCardAttribute = createAction(SET_CARD_ATTRIBUTE, (attr, value) => ({attr, value}));

export const SET_CARD_VISUALIZATION = "SET_CARD_VISUALIZATION";
export const setCardVisualization = createThunkAction(SET_CARD_VISUALIZATION, (display) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls, updateUrl } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, display, card.visualization_settings);
        updateUrl(updatedCard, true);
        return updatedCard;
    }
});

export const SET_CARD_VISUALIZATION_SETTING = "SET_CARD_VISUALIZATION_SETTING";
export const setCardVisualizationSetting = createThunkAction(SET_CARD_VISUALIZATION_SETTING, (path, value) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls, updateUrl } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, card.display, i.assocIn(card.visualization_settings, path, value));
        updateUrl(updatedCard, true);
        return updatedCard;
    };
});

export const SET_CARD_VISUALIZATION_SETTINGS = "SET_CARD_VISUALIZATION_SETTINGS";
export const setCardVisualizationSettings = createThunkAction(SET_CARD_VISUALIZATION_SETTINGS, (settings) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls, updateUrl } } = getState();
        let updatedCard = updateVisualizationSettings(card, uiControls.isEditing, card.display, settings);
        updateUrl(updatedCard, true);
        return updatedCard;
    };
});

export const UPDATE_TEMPLATE_TAG = "UPDATE_TEMPLATE_TAG";
export const updateTemplateTag = createThunkAction(UPDATE_TEMPLATE_TAG, (templateTag) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();

        let updatedCard = JSON.parse(JSON.stringify(card));

        // when the query changes on saved card we change this into a new query w/ a known starting point
        if (!uiControls.isEditing && updatedCard.id) {
            delete updatedCard.id;
            delete updatedCard.name;
            delete updatedCard.description;
        }

        return i.assocIn(updatedCard, ["dataset_query", "native", "template_tags", templateTag.name], templateTag);
    };
});

export const SET_PARAMETER_VALUE = "SET_PARAMETER_VALUE";
export const setParameterValue = createThunkAction(SET_PARAMETER_VALUE, (parameterId, value) => {
    return (dispatch, getState) => {
        let { qb: { parameterValues } } = getState();

        // apply this specific value
        parameterValues = { ...parameterValues, [parameterId]: value};

        // the return value from our action is still just the id/value of the parameter set
        return {id: parameterId, value};
    };
});


export const NOTIFY_CARD_CREATED = "NOTIFY_CARD_CREATED";
export const notifyCardCreatedFn = createThunkAction(NOTIFY_CARD_CREATED, (card) => {
    return (dispatch, getState) => {
        const { qb: { updateUrl } } = getState();

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, false));
        updateUrl(card, false);

        MetabaseAnalytics.trackEvent("QueryBuilder", "Create Card", card.dataset_query.type);

        return card;
    }
});

export const NOTIFY_CARD_UPDATED = "NOTIFY_CARD_UPDATED";
export const notifyCardUpdatedFn = createThunkAction("NOTIFY_CARD_UPDATED", (card) => {
    return (dispatch, getState) => {
        const { qb: { updateUrl } } = getState();

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, false));
        updateUrl(card, false);

        MetabaseAnalytics.trackEvent("QueryBuilder", "Update Card", card.dataset_query.type);

        return card;
    }
});

// reloadCard
export const RELOAD_CARD = "RELOAD_CARD";
export const reloadCard = createThunkAction(RELOAD_CARD, () => {
    return async (dispatch, getState) => {
        const { qb: { originalCard, updateUrl } } = getState();

        // clone
        let card = JSON.parse(JSON.stringify(originalCard));

        dispatch(loadMetadataForCard(card));

        // we do this to force the indication of the fact that the card should not be considered dirty when the url is updated
        dispatch(runQuery(card, false));
        updateUrl(card, false);

        return card;
    };
});

// setCardAndRun
export const SET_CARD_AND_RUN = "SET_CARD_AND_RUN";
export const setCardAndRun = createThunkAction(SET_CARD_AND_RUN, (runCard) => {
    return async (dispatch, getState) => {
        // clone
        let card = JSON.parse(JSON.stringify(runCard));

        dispatch(loadMetadataForCard(card));

        dispatch(runQuery(card));

        return card;
    };
});


// setQuery
export const SET_QUERY = "SET_QUERY";
export const setQuery = createThunkAction(SET_QUERY, (dataset_query, run = false) => {
    return (dispatch, getState) => {
        const { qb: { card, uiControls } } = getState();

        let updatedCard = JSON.parse(JSON.stringify(card)),
            openTemplateTagsEditor = uiControls.isShowingTemplateTagsEditor;

        // when the query changes on saved card we change this into a new query w/ a known starting point
        if (!uiControls.isEditing && updatedCard.id) {
            delete updatedCard.id;
            delete updatedCard.name;
            delete updatedCard.description;
        }

        updatedCard.dataset_query = JSON.parse(JSON.stringify(dataset_query));

        // special handling for NATIVE cards to automatically detect parameters ... {{varname}}
        if (Query.isNative(dataset_query) && !_.isEmpty(dataset_query.native.query)) {
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
export const SET_QUERY_MODE = "SET_QUERY_MODE";
export const setQueryMode = createThunkAction(SET_QUERY_MODE, (type) => {
    return (dispatch, getState) => {
        const { qb: { card, queryResult, tableMetadata, uiControls } } = getState();

        // if the type didn't actually change then nothing has been modified
        if (type === card.dataset_query.type) {
            return card;
        }

        // if we are going from MBQL -> Native then attempt to carry over the query
        if (type === "native" && queryResult && queryResult.data && queryResult.data.native_form) {
            let updatedCard = JSON.parse(JSON.stringify(card));
            let datasetQuery = updatedCard.dataset_query;
            let nativeQuery = _.pick(queryResult.data.native_form, "query", "collection");

            // when the driver requires JSON we need to stringify it because it's been parsed already
            if (_.contains(["mongo", "druid"], tableMetadata.db.engine)) {
                nativeQuery.query = JSON.stringify(queryResult.data.native_form.query);
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
            let newCard = startNewCard(type, card.dataset_query.database);

            dispatch(loadMetadataForCard(newCard));

            return newCard;
        }
    };
});

// setQueryDatabase
export const SET_QUERY_DATABASE = "SET_QUERY_DATABASE";
export const setQueryDatabase = createThunkAction(SET_QUERY_DATABASE, (databaseId) => {
    return async (dispatch, getState) => {
        const { qb: { card, databases, uiControls } } = getState();

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
                let database = _.findWhere(databases, { id: databaseId }),
                    tables   = database ? database.tables : [],
                    table    = tables.length > 0 ? tables[0] : null;
                if (table) updatedCard.dataset_query.native.collection = table.name;
            }

            dispatch(loadMetadataForCard(updatedCard));

            return updatedCard;
        } else {
            // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
            // TODO: should this clear the visualization as well?
            let updatedCard = JSON.parse(JSON.stringify(card));
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
export const SET_QUERY_SOURCE_TABLE = "SET_QUERY_SOURCE_TABLE";
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
            // this is a bit hacky and slow
            const { qb: { databases } } = getState();
            for (var i=0; i < databases.length; i++) {
                const database = databases[i];

                if (_.findWhere(database.tables, { id: tableId })) {
                    databaseId = database.id;
                    break;
                }
            }
        }

        if (!uiControls.isEditing) {
            return startNewCard(card.dataset_query.type, databaseId, tableId);
        } else {
            // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
            // TODO: should this clear the visualization as well?
            let query = createQuery(card.dataset_query.type, databaseId, tableId);

            let updatedCard = JSON.parse(JSON.stringify(card));
            updatedCard.dataset_query = query;
            return updatedCard;
        }
    };
});

// setQuerySort
export const SET_QUERY_SORT = "SET_QUERY_SORT";
export const setQuerySort = createThunkAction(SET_QUERY_SORT, (column) => {
    return (dispatch, getState) => {
        const { qb: { card } } = getState();

        // NOTE: we only allow this for structured type queries & we only allow sorting by a single column
        if (card.dataset_query.type === "query") {
            let field = null;
            if (column.id == null) {
                // ICK.  this is hacky for dealing with aggregations.  need something better
                // DOUBLE ICK.  we also need to deal with custom fields now as well
                if (_.contains(_.keys(Query.getExpressions(card.dataset_query.query)), column.display_name)) {
                    field = ["expression", column.display_name];
                } else {
                    field = ["aggregation", 0];
                }
            } else {
                field = column.id;
            }

            let dataset_query = JSON.parse(JSON.stringify(card.dataset_query)),
                sortClause = [field, "ascending"];

            if (card.dataset_query.query.order_by &&
                card.dataset_query.query.order_by.length > 0 &&
                card.dataset_query.query.order_by[0].length > 0 &&
                card.dataset_query.query.order_by[0][1] === "ascending" &&
                Query.isSameField(card.dataset_query.query.order_by[0][0], field)) {
                // someone triggered another sort on the same column, so flip the sort direction
                sortClause = [field, "descending"];
            }

            // set clause
            dataset_query.query.order_by = [sortClause];

            // update and run the query
            dispatch(setQuery(dataset_query, true));
        }

        return null;
    };
});

// runQuery
export const RUN_QUERY = "RUN_QUERY";
export const runQuery = createThunkAction(RUN_QUERY, (card, updateUrl=true, paramValues) => {
    return async (dispatch, getState) => {
        const state = getState();
        const parameters = getParameters(state);

        // if we got a query directly on the action call then use it, otherwise take whatever is in our current state
        card = card || state.qb.card;
        card = JSON.parse(JSON.stringify(card));
        let dataset_query = card.dataset_query,
            cardIsDirty = isCardDirty(card, state.qb.originalCard);

        if (dataset_query.query) {
            // TODO: this needs to be immutable
            dataset_query.query = Query.cleanQuery(dataset_query.query);
        }

        // apply any pseudo-parameters, if specified
        if (parameters && parameters.length > 0) {
            let templateTags = card.dataset_query.native.template_tags || {};
            let parameterValues = paramValues || state.qb.parameterValues || {};
            dataset_query.parameters = parameters.map(parameter => {
                let tag = _.findWhere(templateTags, { id: parameter.id });
                let value = parameterValues[parameter.id];
                if (value != null && tag) {
                    return {
                        type: parameter.type,
                        target: [tag.type === "dimension" ? "dimension" : "variable", ["template-tag", tag.name]],
                        value: value
                    };
                }
            }).filter(p => p);
        }

        if (updateUrl) {
            state.qb.updateUrl(card, cardIsDirty);
        }

        let cancelQueryDeferred = angularPromise();
        let startTime = new Date();

        // make our api call
        Metabase.dataset({ timeout: cancelQueryDeferred.promise }, dataset_query, function (queryResult) {
            dispatch(queryCompleted(card, queryResult));

        }, function (error) {
            dispatch(queryErrored(startTime, error));
        });

        MetabaseAnalytics.trackEvent("QueryBuilder", "Run Query", dataset_query.type);

        // HACK: prevent SQL editor from losing focus
        try { ace.edit("id_sql").focus() } catch (e) {}

        return cancelQueryDeferred;
    };
});

export const QUERY_COMPLETED = "QUERY_COMPLETED";
export const queryCompleted = createThunkAction(QUERY_COMPLETED, (card, queryResult) => {
    return async (dispatch, getState) => {
        let cardDisplay = card.display;

        // try a little logic to pick a smart display for the data
        if (card.display !== "scalar" &&
                queryResult.data.rows &&
                queryResult.data.rows.length === 1 &&
                queryResult.data.columns.length === 1) {
            // if we have a 1x1 data result then this should always be viewed as a scalar
            cardDisplay = "scalar";

        } else if (card.display === "scalar" &&
                    queryResult.data.rows &&
                    (queryResult.data.rows.length > 1 || queryResult.data.columns.length > 1)) {
            // any time we were a scalar and now have more than 1x1 data switch to table view
            cardDisplay = "table";

        } else if (Query.isStructured(card.dataset_query) &&
                    Query.isBareRowsAggregation(card.dataset_query.query) &&
                    card.display !== "pin_map") {
            // if our query aggregation is "rows" then ALWAYS set the display to "table"
            cardDisplay = "table";
        }

        return {
            cardDisplay,
            queryResult
        }
    };
});

export const QUERY_ERRORED = "QUERY_ERRORED";
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
export const CANCEL_QUERY = "CANCEL_QUERY";
export const cancelQuery = createThunkAction(CANCEL_QUERY, () => {
    return async (dispatch, getState) => {
        const { qb: { uiControls, queryExecutionPromise } } = getState();

        if (uiControls.isRunning && queryExecutionPromise) {
            queryExecutionPromise.resolve();
        }
    };
});

// cellClicked
export const CELL_CLICKED = "CELL_CLICKED";
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

        if (coldef.special_type === "id") {
            // action is on a PK column
            let newCard = startNewCard("query", card.dataset_query.database);

            newCard.dataset_query.query.source_table = coldef.table_id;
            newCard.dataset_query.query.aggregation = ["rows"];
            newCard.dataset_query.query.filter = ["AND", ["=", fieldRefForm, value]];

            // run it
            dispatch(setCardAndRun(newCard));

            MetabaseAnalytics.trackEvent("QueryBuilder", "Table Cell Click", "PK");
        } else if (coldef.special_type === "fk") {
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
            let dataset_query = JSON.parse(JSON.stringify(card.dataset_query));
            Query.addFilter(dataset_query.query);

            if (coldef.unit) {
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
                Query.updateFilter(dataset_query.query, dataset_query.query.filter.length - 1, ["BETWEEN", fieldRefForm, start, end]);

            } else {
                // quick filtering on a normal value (string/number)
                Query.updateFilter(dataset_query.query, dataset_query.query.filter.length - 1, [filter, fieldRefForm, value]);
            }

            // update and run the query
            dispatch(setQuery(dataset_query, true));

            MetabaseAnalytics.trackEvent("QueryBuilder", "Table Cell Click", "Quick Filter");
        }
    };
});

export const FOLLOW_FOREIGN_KEY = "FOLLOW_FOREIGN_KEY";
export const followForeignKey = createThunkAction(FOLLOW_FOREIGN_KEY, (fk) => {
    return async (dispatch, getState) => {
        const { qb: { card, queryResult } } = getState();

        if (!queryResult || !fk) return false;

        // extract the value we will use to filter our new query
        var originValue;
        for (var i=0; i < queryResult.data.cols.length; i++) {
            if (queryResult.data.cols[i].special_type === "id") {
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


export const LOAD_OBJECT_DETAIL_FK_REFERENCES = "LOAD_OBJECT_DETAIL_FK_REFERENCES";
export const loadObjectDetailFKReferences = createThunkAction(LOAD_OBJECT_DETAIL_FK_REFERENCES, () => {
    return async (dispatch, getState) => {
        const { qb: { card, queryResult, tableForeignKeys } } = getState();

        function getObjectDetailIdValue(data) {
            for (var i=0; i < data.cols.length; i++) {
                var coldef = data.cols[i];
                if (coldef.special_type === "id") {
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
                let result = await Metabase.dataset(fkQuery);
                if (result && result.status === "completed" && result.data.rows.length > 0) {
                    info["value"] = result.data.rows[0][0];
                } else {
                    info["value"] = "Unknown";
                }
            } catch (error) {
                console.log("error getting fk count", error, fkQuery);
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


// these are just temporary mappings to appease the existing QB code and it's naming prefs
export const toggleDataReferenceFn = toggleDataReference;
export const onBeginEditing = beginEditing;
export const onCancelEditing = cancelEditing;
export const setQueryModeFn = setQueryMode;
export const setSortFn = setQuerySort;
export const setQueryFn = setQuery;
export const runQueryFn = runQuery;
export const cancelQueryFn = cancelQuery;
export const setDatabaseFn = setQueryDatabase;
export const setSourceTableFn = setQuerySourceTable;
export const setDisplayFn = setCardVisualization;
export const onSetCardAttribute = setCardAttribute;
export const reloadCardFn = reloadCard;
export const onRestoreOriginalQuery = reloadCard;
export const onUpdateVisualizationSetting = setCardVisualizationSetting;
export const onUpdateVisualizationSettings = setCardVisualizationSettings;
export const cellClickedFn = cellClicked;
export const followForeignKeyFn = followForeignKey;
