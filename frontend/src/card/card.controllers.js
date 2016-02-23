/*global ace*/

import React from "react";
import ReactDOM from "react-dom";

import DataReference from '../query_builder/DataReference.jsx';
import GuiQueryEditor from '../query_builder/GuiQueryEditor.jsx';
import NativeQueryEditor from '../query_builder/NativeQueryEditor.jsx';
import QueryHeader from '../query_builder/QueryHeader.jsx';
import QueryVisualization from '../query_builder/QueryVisualization.jsx';
import QueryBuilderTutorial from '../tutorial/QueryBuilderTutorial.jsx';
import SavedQuestionIntroModal from "../query_builder/SavedQuestionIntroModal.jsx";

import SavedQuestionsApp from './containers/SavedQuestionsApp.jsx';

import { createStore, combineReducers } from "metabase/lib/redux";
import _ from "underscore";

import MetabaseAnalytics from "metabase/lib/analytics";
import DataGrid from "metabase/lib/data_grid";
import Query from "metabase/lib/query";
import { createQuery } from "metabase/lib/query";
import { createCard, serializeCardForUrl, deserializeCardFromUrl, cleanCopyCard, urlForCardState } from "metabase/lib/card";
import { loadTable } from "metabase/lib/table";
import { getDefaultColor } from "metabase/lib/visualization_settings";

import NotFound from "metabase/components/NotFound.jsx";

import * as reducers from './reducers';

const reducer = combineReducers(reducers);

//  Card Controllers
var CardControllers = angular.module('metabase.card.controllers', []);

CardControllers.controller('CardList', ['$scope', '$location', function($scope, $location) {
    $scope.Component = SavedQuestionsApp;
    $scope.props = {
        user: $scope.user,
        onChangeLocation: function(url) {
            $scope.$apply(() => $location.url(url));
        }
    };
    $scope.store = createStore(reducer, {});
}]);

CardControllers.controller('CardDetail', [
    '$rootScope', '$scope', '$route', '$routeParams', '$location', '$q', '$window', '$timeout', 'Card', 'Dashboard', 'Metabase', 'Revision', 'User',
    function($rootScope, $scope, $route, $routeParams, $location, $q, $window, $timeout, Card, Dashboard, Metabase, Revision, User) {
        // promise helper
        $q.resolve = function(object) {
            var deferred = $q.defer();
            deferred.resolve(object);
            return deferred.promise;
        }

        // =====  Controller local objects

        $scope.isShowingDataReference = false;

        var queryResult = null,
            databases = null,
            tables = null,
            tableMetadata = null,
            tableForeignKeys = null,
            tableForeignKeyReferences = null,
            isRunning = false,
            isEditing = false,
            isObjectDetail = false,
            isShowingTutorial = false,
            isShowingNewbModal = false,
            card = {
                name: null,
                public_perms: 0,
                display: "table",
                visualization_settings: {},
                dataset_query: {},
            },
            originalCard,
            savedCardSerialized = null;

        resetDirty();


        // =====  REACT component models

        var headerModel = {
            card: null,
            tableMetadata: null,
            fromUrl: $routeParams.from,
            cardApi: Card,
            dashboardApi: Dashboard,
            revisionApi: Revision,
            broadcastEventFn: function(eventName, value) {
                $rootScope.$broadcast(eventName, value);
            },
            onSetCardAttribute: function(attribute, value) {
                // these are the only things we let the header change
                if (attribute === "name" || attribute === "description") {
                    card[attribute] = value;
                    renderAll();
                }
            },
            notifyCardCreatedFn: function(newCard) {
                setCard(newCard, { resetDirty: true, replaceState: true });

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Create Card', newCard.dataset_query.type);
            },
            notifyCardUpdatedFn: function(updatedCard) {
                setCard(updatedCard, { resetDirty: true, replaceState: true });

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Update Card', updatedCard.dataset_query.type);
            },
            setQueryModeFn: function(type) {
                if (!card.dataset_query.type || type !== card.dataset_query.type) {
                    // switching to a new query type represents a brand new card & query on the given mode
                    let newCard = startNewCard(type, card.dataset_query.database);
                    setCard(newCard, {resetDirty: true, runQuery: false});
                    MetabaseAnalytics.trackEvent('QueryBuilder', 'Query Started', type);
                }
            },
            cloneCardFn: function() {
                $scope.$apply(() => {
                    delete card.id;
                    setCard(card, { setDirty: true, replaceState: false })
                });
            },
            reloadCardFn: reloadCard,
            onChangeLocation: function(url) {
                $timeout(() => $location.url(url))
            },
            toggleDataReferenceFn: toggleDataReference,
            onBeginEditing: function() {
                isEditing = true;
                renderAll();
            },
            onCancelEditing: function() {
                // reset back to our original card
                isEditing = false;
                setCard(originalCard, {resetDirty: true});
            },
            onRestoreOriginalQuery: function () {
                setCard(originalCard, {resetDirty: true});
            },
            cardIsNewFn: cardIsNew,
            cardIsDirtyFn: cardIsDirty
        };

        var editorModel = {
            isRunning: false,
            isShowingDataReference: null,
            databases: null,
            tableMetadata: null,
            tableForeignKeys: null,
            query: null,
            setQueryFn: onQueryChanged,
            setDatabaseFn: setDatabase,
            setSourceTableFn: setSourceTable,
            autocompleteResultsFn: function(prefix) {
                var apiCall = Metabase.db_autocomplete_suggestions({
                    dbId: card.dataset_query.database,
                    prefix: prefix
                });
                return apiCall.$promise;
            }
        };

        var visualizationModel = {
            card: null,
            result: null,
            databases: null,
            tableMetadata: null,
            tableForeignKeys: null,
            tableForeignKeyReferences: null,
            isRunning: false,
            runQueryFn: runQuery,
            isObjectDetail: false,
            setDisplayFn: function(display) {
                onVisualizationSettingsChanged(display, card.visualization_settings);
            },
            setChartColorFn: function(color) {
                let vizSettings = angular.copy(card.visualization_settings);

                // if someone picks the default color then clear any color settings
                if (color === getDefaultColor()) {
                    // NOTE: this only works if setting color is the only option we allow
                    vizSettings = {};

                } else {
                    // this really needs to be better
                    let lineSettings = (vizSettings.line) ? vizSettings.line : {};
                    let areaSettings = (vizSettings.area) ? vizSettings.area : {};
                    let barSettings = (vizSettings.bar) ? vizSettings.bar : {};

                    lineSettings.lineColor = color;
                    lineSettings.marker_fillColor = color;
                    lineSettings.marker_lineColor = color;
                    areaSettings.fillColor = color;
                    barSettings.color = color;

                    vizSettings.line = lineSettings;
                    vizSettings.area = areaSettings;
                    vizSettings.bar = barSettings;
                }

                onVisualizationSettingsChanged(card.display, vizSettings);
            },
            setSortFn: function(fieldId) {
                // NOTE: we only allow this for structured type queries & we only allow sorting by a single column
                if (card.dataset_query.type === "query") {
                    let dataset_query = card.dataset_query,
                        sortClause = [fieldId, "ascending"];

                    if (card.dataset_query.query.order_by &&
                        card.dataset_query.query.order_by.length > 0 &&
                        card.dataset_query.query.order_by[0].length > 0 &&
                        card.dataset_query.query.order_by[0][1] === "ascending" &&
                        Query.isSameField(card.dataset_query.query.order_by[0][0], fieldId)) {
                        // someone triggered another sort on the same column, so flip the sort direction
                        sortClause = [fieldId, "descending"];
                    }

                    // set clause
                    dataset_query.query.order_by = [sortClause];

                    // update the query
                    onQueryChanged(dataset_query);

                    // run updated query
                    runQuery();
                }
            },
            cellIsClickableFn: function(rowIndex, columnIndex) {
                if (!queryResult) return false;

                // lookup the coldef and cell value of the cell we are curious about
                var coldef = queryResult.data.cols[columnIndex];

                if (!coldef || !coldef.special_type) return false;

                if (coldef.table_id != null && coldef.special_type === 'id' || (coldef.special_type === 'fk' && coldef.target)) {
                    return true;
                } else {
                    return false;
                }
            },
            cellClickedFn: function(rowIndex, columnIndex, filter) {
                if (!queryResult) return false;

                // lookup the coldef and cell value of the cell we are taking action on
                var coldef = queryResult.data.cols[columnIndex],
                    value = queryResult.data.rows[rowIndex][columnIndex];

                if (coldef.special_type === "id") {
                    // action is on a PK column
                    let newCard = startNewCard("query", card.dataset_query.database);

                    newCard.dataset_query.query.source_table = coldef.table_id;
                    newCard.dataset_query.query.aggregation = ["rows"];
                    newCard.dataset_query.query.filter = ["AND", ["=", coldef.id, value]];

                    // run it
                    setCard(newCard);

                } else if (coldef.special_type === "fk") {
                    // action is on an FK column
                    let newCard = startNewCard("query", card.dataset_query.database);

                    newCard.dataset_query.query.source_table = coldef.target.table_id;
                    newCard.dataset_query.query.aggregation = ["rows"];
                    newCard.dataset_query.query.filter = ["AND", ["=", coldef.target.id, value]];

                    // run it
                    setCard(newCard);

                } else {
                    // this is applying a filter by clicking on a cell value
                    let dataset_query = angular.copy(card.dataset_query);
                    Query.addFilter(dataset_query.query);
                    Query.updateFilter(dataset_query.query, dataset_query.query.filter.length - 1, [filter, coldef.id, value]);
                    onQueryChanged(dataset_query);
                    runQuery();
                 }
            },
            followForeignKeyFn: function(fk) {
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
                setCard(newCard);
            }
        };

        var dataReferenceModel = {
            Metabase: Metabase,
            closeFn: toggleDataReference,
            runQueryFn: runQuery,
            setQueryFn: onQueryChanged,
            setDatabaseFn: setDatabase,
            setSourceTableFn: setSourceTable,
            setDisplayFn: function(display) {
                onVisualizationSettingsChanged(display, card.visualization_settings);
            },
            loadTableFn: loadTable
        };

        // =====  REACT render functions

        function renderHeader() {
            // ensure rendering model is up to date
            headerModel.card = angular.copy(card);
            headerModel.isEditing = isEditing;
            headerModel.originalCard = originalCard;
            headerModel.tableMetadata = tableMetadata;
            headerModel.isShowingDataReference = $scope.isShowingDataReference;

            ReactDOM.render(<QueryHeader {...headerModel}/>, document.getElementById('react_qb_header'));
        }

        function renderEditor() {
            // ensure rendering model is up to date
            editorModel.isRunning = isRunning;
            editorModel.isShowingDataReference = $scope.isShowingDataReference;
            editorModel.isShowingTutorial = isShowingTutorial;
            editorModel.databases = databases;
            editorModel.tableMetadata = tableMetadata;
            editorModel.tableForeignKeys = tableForeignKeys;
            editorModel.query = card.dataset_query;

            if (card.dataset_query && card.dataset_query.type === "native") {
                ReactDOM.render(<NativeQueryEditor {...editorModel}/>, document.getElementById('react_qb_editor'));
            } else {
                ReactDOM.render(<div className="wrapper"><GuiQueryEditor {...editorModel}/></div>, document.getElementById('react_qb_editor'));
            }
        }

        function renderVisualization() {
            // ensure rendering model is up to date
            visualizationModel.card = angular.copy(card);
            visualizationModel.result = queryResult;
            visualizationModel.databases = databases;
            visualizationModel.tableMetadata = tableMetadata;
            visualizationModel.tableForeignKeys = tableForeignKeys;
            visualizationModel.tableForeignKeyReferences = tableForeignKeyReferences;
            visualizationModel.isRunning = isRunning;
            visualizationModel.isObjectDetail = isObjectDetail;

            ReactDOM.render(<QueryVisualization {...visualizationModel}/>, document.getElementById('react_qb_viz'));
        }

        function renderDataReference() {
            dataReferenceModel.databases = databases;
            dataReferenceModel.query = card.dataset_query;
            ReactDOM.render(<DataReference {...dataReferenceModel}/>, document.getElementById('react_data_reference'));
        }

        let tutorialModel = {
            onClose: () => {
                isShowingTutorial = false;
                updateUrl();
                renderAll();
            }
        }

        function renderTutorial() {
            tutorialModel.isShowingTutorial = isShowingTutorial;
            ReactDOM.render(
                <span>{tutorialModel.isShowingTutorial && <QueryBuilderTutorial {...tutorialModel} /> }</span>
            , document.getElementById('react_qb_tutorial'));
        }

        let newbModalModel = {
            onClose: () => {
                isShowingNewbModal = false;
                renderAll();

                // persist the fact that this user has seen the NewbModal
                $scope.user.is_qbnewb = false;
                User.update_qbnewb({id: $scope.user.id});
            }
        }

        function renderNewbModal() {
            newbModalModel.isShowingNewbModal = isShowingNewbModal;
            ReactDOM.render(
                <span>{newbModalModel.isShowingNewbModal && <SavedQuestionIntroModal {...newbModalModel} /> }</span>
            , document.getElementById('react_qbnewb_modal'));
        }

        function renderNotFound() {
            ReactDOM.render(<NotFound></NotFound>, document.getElementById('react_qb_viz'));
        }

        var renderAll = _.debounce(function() {
            renderHeader();
            renderEditor();
            renderVisualization();
            renderDataReference();
            renderTutorial();
            renderNewbModal();
        }, 10);


        // =====  Local helper functions

        function runQuery() {
            let dataset_query = card.dataset_query;

            if (dataset_query.query) {
                Query.cleanQuery(dataset_query.query);
            }

            isRunning = true;

            updateUrl();

            renderAll();

            let startTime = new Date();
            // make our api call
            Metabase.dataset(dataset_query, function (result) {
                queryResult = result;
                isRunning = false;

                // do a quick test to see if we are meant to render and object detail view or normal results
                if(isObjectDetailQuery(card, queryResult.data)) {
                    isObjectDetail = true;

                    // TODO: there are possible cases where running a query would not require refreshing this data, but
                    // skipping that for now because it's easier to just run this each time

                    // run a query on FK origin table where FK origin field = objectDetailIdValue
                    var fkReferences = {};
                    tableForeignKeys.map(function(fk) {
                        var fkQuery = createQuery("query");
                        fkQuery.database = card.dataset_query.database;
                        fkQuery.query.source_table = fk.origin.table_id;
                        fkQuery.query.aggregation = ["count"];
                        fkQuery.query.filter = ["AND", ["=", fk.origin.id, getObjectDetailIdValue(queryResult.data)]];

                        var info = {"status": 0, "value": null},
                            promise = Metabase.dataset(fkQuery).$promise;
                        promise.then(function(result) {
                            if (result && result.status === "completed" && result.data.rows.length > 0) {
                                info["value"] = result.data.rows[0][0];
                            } else {
                                info["value"] = "Unknown";
                            }
                        }).finally(function(result) {
                            info["status"] = 1;
                            renderAll();
                        });
                        fkReferences[fk.origin.id] = info;
                    });

                    tableForeignKeyReferences = fkReferences;

                } else {
                    isObjectDetail = false;

                    // if we are display bare rows, filter out columns with preview_display = false
                    if (Query.isStructured(dataset_query) &&
                            Query.isBareRowsAggregation(dataset_query.query)) {
                        queryResult.data = DataGrid.filterOnPreviewDisplay(queryResult.data);
                    }
                }

                // try a little logic to pick a smart display for the data
                if (card.display !== "scalar" &&
                        queryResult.data.rows &&
                        queryResult.data.rows.length === 1 &&
                        queryResult.data.columns.length === 1) {
                    // if we have a 1x1 data result then this should always be viewed as a scalar
                    card.display = "scalar";

                } else if (card.display === "scalar" &&
                            queryResult.data.rows &&
                            (queryResult.data.rows.length > 1 || queryResult.data.columns.length > 1)) {
                    // any time we were a scalar and now have more than 1x1 data switch to table view
                    card.display = "table";

                } else if (dataset_query.type === "query" &&
                            dataset_query.query.aggregation &&
                            dataset_query.query.aggregation.length > 0 &&
                            dataset_query.query.aggregation[0] === "rows" &&
                            card.display !== "pin_map") {
                    // if our query aggregation is "rows" then ALWAYS set the display to "table"
                    card.display = "table";
                }

                renderAll();

            }, function (error) {
                isRunning = false;
                queryResult = { error: error, duration: new Date() - startTime };

                renderAll();
            });

            MetabaseAnalytics.trackEvent('QueryBuilder', 'Run Query', dataset_query.type);

            // HACK: prevent SQL editor from losing focus
            try { ace.edit("id_sql").focus() } catch (e) {};
        }

        function loadTableInfo(tableId) {
            if (tableMetadata && tableMetadata.id === tableId) {
                return;
            }

            tableMetadata = null;
            tableForeignKeys = null;

            loadTable(tableId).then(function (results) {
                tableMetadata = results.table;
                tableForeignKeys = results.foreignKeys;
                renderAll();
            }, function (error) {
                console.log('error getting table metadata', error);
            });
        }

        function loadDatabaseInfo(databaseId) {
            if (tables && tables[0] && tables[0].db_id === databaseId) {
                return;
            }

            tables = null;
            tableMetadata = null;

            let db = _.findWhere(databases, { id: databaseId });
            if (db && db.tables) {
                tables = db.tables;
                renderAll();
                return;
            }

            // get tables for db
            Metabase.db_tables({
                'dbId': databaseId
            }).$promise.then(function (tables_list) {
                tables = tables_list;

                renderAll();
            }, function (error) {
                console.log('error getting tables', error);
            });
        }

        // indicates that the database for the query should be changed to the given value
        // when editing, simply update the value.  otherwise, this should create a completely new card
        function setDatabase(databaseId) {
            if (databaseId !== card.dataset_query.database) {
                let existingQuery = (card.dataset_query.native) ? card.dataset_query.native.query : undefined;
                if (!isEditing) {
                    let newCard = startNewCard(card.dataset_query.type, databaseId);
                    if (existingQuery) {
                        newCard.dataset_query.native.query = existingQuery;
                    }

                    setCard(newCard, {runQuery: false});
                } else {
                    // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
                    // TODO: should this clear the visualization as well?
                    let query = createQuery(card.dataset_query.type, databaseId);
                    if (existingQuery) {
                        query.native.query = existingQuery;
                    }

                    setQuery(query);

                    loadDatabaseInfo(databaseId);
                }
            }
            return card.dataset_query;
        }

        // indicates that the table for the query should be changed to the given value
        // when editing, simply update the value.  otherwise, this should create a completely new card
        function setSourceTable(sourceTable) {
            // this will either be the id or an object with an id
            var tableId = sourceTable.id || sourceTable;
            if (tableId !== card.dataset_query.query.source_table) {
                if (!isEditing) {
                    let newCard = startNewCard(card.dataset_query.type, card.dataset_query.database, tableId);
                    setCard(newCard, {runQuery: false});
                } else {
                    // if we are editing a saved query we don't want to replace the card, so just start a fresh query only
                    // TODO: should this clear the visualization as well?
                    let query = createQuery(card.dataset_query.type, card.dataset_query.database, tableId);

                    setQuery(query);

                    loadTableInfo(tableId);
                }
            }
            return card.dataset_query;
        }

        // this indicates that the user has taken an action that changed one of the query clauses (not the database or table)
        // when we are a saved card but not in edit mode this triggers the creation of a new card started from a specific card, otherwise we just apply the change
        function onQueryChanged(dataset_query) {
            // when the query changes on saved card we change this into a new query w/ a known starting point
            if (!isEditing && card.id) {
                delete card.id;
                delete card.name;
                delete card.description;
            }

            setQuery(dataset_query);
        }

        function setQuery(dataset_query) {
            // we are being told that the query has been modified
            card.dataset_query = dataset_query;
            renderAll();
            return card.dataset_query;
        }

        // this indicates that the user has taken an action that changed one of the visualization settings
        // when we are a saved card but not in edit mode this triggers the creation of a new card started from a specific card, otherwise we just apply the change
        function onVisualizationSettingsChanged(display, cardVizSettings) {
            // make sure that something actually changed
            if (card.display === display && _.isEqual(card.visualization_settings, cardVizSettings)) return;

            // when the visualization changes on saved card we change this into a new card w/ a known starting point
            if (!isEditing && card.id) {
                delete card.id;
                delete card.name;
                delete card.description;
            }

            card.display = display;
            card.visualization_settings = cardVizSettings;

            renderAll();
        }

        function isObjectDetailQuery(card, data) {
            var response = false;

            // TODO: why can't we just use the Table Metadata here instead of the query result?

            // "rows" type query w/ an '=' filter against the PK column
            if (card.dataset_query &&
                    card.dataset_query.query &&
                    card.dataset_query.query.source_table &&
                    card.dataset_query.query.filter &&
                    card.dataset_query.query.aggregation &&
                    card.dataset_query.query.aggregation.length > 0 &&
                    card.dataset_query.query.aggregation[0] === "rows" &&
                    data.rows &&
                    data.rows.length === 1) {

                // we need to know the PK field of the table that was queried, so find that now
                var pkField;
                for (var i=0; i < data.cols.length; i++) {
                    var coldef = data.cols[i];
                    if (coldef.table_id === card.dataset_query.query.source_table &&
                            coldef.special_type === "id") {
                        pkField = coldef.id;
                    }
                }

                // now check that we have a filter clause w/ '=' filter on PK column
                if (pkField !== undefined) {
                    for (var j=0; j < card.dataset_query.query.filter.length; j++) {
                        var filter = card.dataset_query.query.filter[j];
                        if (Array.isArray(filter) &&
                                filter.length === 3 &&
                                filter[0] === "=" &&
                                filter[1] === pkField &&
                                filter[2] !== null) {
                            // well, all of our conditions have passed so we have an object detail query here
                            response = true;
                        }
                    }
                }
            }

            return response;
        }

        function getObjectDetailIdValue(data) {
            for (var i=0; i < data.cols.length; i++) {
                var coldef = data.cols[i];
                if (coldef.special_type === "id") {
                    return data.rows[0][i];
                }
            }
        }

        function toggleDataReference() {
            $scope.$apply(function() {
                $scope.isShowingDataReference = !$scope.isShowingDataReference;
                // renderAll();
                // render again after 500ms to wait for animation to complete
                // FIXME: if previous render takes too long this is missed
                window.setTimeout(renderAll, 300);
            });
        }

        // start a new card using the given query type and optional database and table selections
        function startNewCard(type, databaseId, tableId) {
            // carry over currently selected database to new query, if possible otherwise try to set the database to a sensible default
            // TODO: be smarter about this and use the most recent or popular db
            if (!databaseId && databases && databases.length > 0) {
                databaseId = databases[0].id;
            }

            // create a brand new card to work from
            let card = createCard();
            card.dataset_query = createQuery(type, databaseId, tableId);

            return card;
        }

        function loadSerializedCard(serialized) {
            const card = deserializeCardFromUrl(serialized);

            if (serialized !== serializeCardForUrl(startNewCard(card.dataset_query.type))) {
                card.isDirty = true;
            }

            return card;
        }

        // load up a card, either from existing data such as a cardId or serialized card info, or create a new one including options from url params
        async function loadCard(cardId, serializedCard) {
            if (cardId != undefined) {
                let card = await Card.get({ 'cardId': cardId }).$promise;
                if (serializedCard) {
                    let deserializedCard = await loadSerializedCard(serializedCard);
                    return _.extend(card, deserializedCard);
                } else {
                    return card;
                }

            } else if (serializedCard) {
                return loadSerializedCard(serializedCard);

            } else {
                let card = startNewCard("query");

                // initialize parts of the query based on the information we have in the query params
                if ($routeParams.db != undefined) {
                    card.dataset_query.database = parseInt($routeParams.db);
                } else if (databases && databases.length > 0) {
                    card.dataset_query.database = databases[0].id;
                }

                if ($routeParams.table != undefined && card.dataset_query.query) {
                    card.dataset_query.query.source_table = parseInt($routeParams.table);
                    card.isDirty = true;
                }

                if ($routeParams.segment != undefined && card.dataset_query.query) {
                    card.dataset_query.query.filter = ["AND", ["SEGMENT", parseInt($routeParams.segment)]];
                    card.isDirty = true;
                }

                if ($routeParams.metric != undefined && card.dataset_query.query) {
                    card.dataset_query.query.aggregation = ["METRIC", parseInt($routeParams.metric)];
                    card.isDirty = true;
                }

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Query Started', "query");
                return card;
            }
        }

        // completely reset the active card on the QB.  includes options for: resetDirty, setDirty, runQuery
        function setCard(result, options = {}) {
            // update our react models as needed
            card = result;
            queryResult = null;
            isEditing = false;

            if (card.id) {
                originalCard = angular.copy(result);
            } else {
                originalCard = undefined;
            }

            if (options.resetDirty) {
                resetDirty();
            }
            if (options.setDirty) {
                setDirty();
            }

            updateUrl(options.replaceState);

            // track our lineage
            if (card.id) {
                originalCard = angular.copy(card);
            }

            // load metadata
            loadDatabaseInfo(card.dataset_query.database);

            if (card.dataset_query.type === "query" && card.dataset_query.query.source_table) {
                loadTableInfo(card.dataset_query.query.source_table);
            }

            // run the query
            // TODO: if the card isn't actually modified then ideally we won't run the query here
            if (options.runQuery !== false && (Query.canRun(card.dataset_query.query) || card.dataset_query.type === "native")) {
                runQuery();
            }

            // trigger full rendering
            renderAll();
        }

        // meant to be called once on controller startup
        async function loadAndSetCard() {
            try {
                const cardId = $routeParams.cardId;
                const serializedCard = _.isEmpty($location.hash()) ? null : $location.hash();

                let card = await loadCard(cardId, serializedCard);

                if ($routeParams.edit) {
                    isEditing = true;
                }

                // HACK: dirty status passed in the object itself, delete it
                let isDirty = !!card.isDirty;
                delete card.isDirty;
                return setCard(card, { setDirty: isDirty, resetDirty: !isDirty, replaceState: true });
            } catch (error) {
                if (error.status === 404) {
                    renderNotFound();
                }
            }
        }

        function cardIsNew() {
            return !card.id;
        }

        function cardIsDirty() {
            var newCardSerialized = serializeCardForUrl(card);

            return newCardSerialized !== savedCardSerialized;
        }

        function resetDirty() {
            savedCardSerialized = serializeCardForUrl(card);
        }

        function setDirty() {
            savedCardSerialized = null;
        }

        function reloadCard() {
            $location.hash(null);
            loadAndSetCard();
        }

        function setSampleDataset() {
            let sampleDataset = _.findWhere(databases, { is_sample: true });
            setDatabase(sampleDataset.id);
        }

        function updateUrl(replaceState) {
            // don't update the URL if we're currently showing the tutorial
            if (isShowingTutorial) {
                return;
            }

            var copy = cleanCopyCard(card);
            var newState = {
                card: copy,
                cardId: copy.id,
                serializedCard: serializeCardForUrl(copy)
            };

            if (angular.equals(window.history.state, newState)) {
                return;
            }

            var url = urlForCardState(newState, cardIsDirty());

            // if the serialized card is identical replace the previous state instead of adding a new one
            // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
            replaceState = replaceState || (window.history.state && window.history.state.serializedCard === newState.serializedCard);

            // ensure the digest cycle is run, otherwise pending location changes will prevent navigation away from query builder on the first click
            $scope.$apply(() => {
                // prevents infinite digest loop
                // https://stackoverflow.com/questions/22914228/successfully-call-history-pushstate-from-angular-without-inifinite-digest
                $location.url(url);
                $location.replace();
                if (replaceState) {
                    window.history.replaceState(newState, null, $location.absUrl());
                } else {
                    window.history.pushState(newState, null, $location.absUrl());
                }
            });
        }

        function popStateListener(e) {
            if (e.state && e.state.card) {
                e.preventDefault();
                setCard(e.state.card, {});
            }
        }

        // add popstate listener to support undo/redo via browser history
        angular.element($window).on('popstate', popStateListener);

        // When the window is resized we need to re-render, mainly so that our visualization pane updates
        // Debounce the function to improve resizing performance.
        var debouncedRenderAll = _.debounce(renderAll, 400);
        angular.element($window).on('resize', debouncedRenderAll);

        $scope.$on("$destroy", function() {
            angular.element($window).off('popstate', popStateListener);
            angular.element($window).off('resize', debouncedRenderAll);

            // any time we route away from the query builder force unmount our react components to make sure they have a chance
            // to fully clean themselves up and remove things like popover elements which may be on the screen
            ReactDOM.unmountComponentAtNode(document.getElementById('react_qb_header'));
            ReactDOM.unmountComponentAtNode(document.getElementById('react_qb_editor'));
            ReactDOM.unmountComponentAtNode(document.getElementById('react_qb_viz'));
            ReactDOM.unmountComponentAtNode(document.getElementById('react_data_reference'));
        });

        // prevent angular route change when we manually update the url
        // NOTE: we tried listening on $locationChangeStart and simply canceling that, but doing so prevents the history and everything
        //       and ideally we'd simply listen on $routeChangeStart and cancel that when it's the same controller, but that doesn't work :(

        // mildly hacky way to prevent reloading controllers as the URL changes
        // this works by setting the new route to the old route and manually moving over params
        var route = $route.current;
        $scope.$on('$locationChangeSuccess', function (event) {
            var newParams = $route.current.params;
            var oldParams = route.params;

            // reload the controller if:
            // 1. not CardDetail
            // 2. both serializedCard and cardId are not set (new card)
            // TODO: is there really ever a reason to reload this route if we are going to the same place?
            const serializedCard = _.isEmpty($location.hash()) ? null : $location.hash();
            if ($route.current.$$route.controller === 'CardDetail' && (serializedCard || newParams.cardId)) {
                $route.current = route;

                angular.forEach(oldParams, function(value, key) {
                    delete $route.current.params[key];
                    delete $routeParams[key];
                });
                angular.forEach(newParams, function(value, key) {
                    $route.current.params[key] = value;
                    $routeParams[key] = value;
                });
            }
        });

        async function init() {
            try {
                databases = await Metabase.db_list_with_tables().$promise;

                if (databases.length < 1) {
                    // TODO: some indication that setting up a db is required
                    return;
                }

                isShowingTutorial = $routeParams.tutorial;
                isShowingNewbModal = $routeParams.cardId && $scope.user.is_qbnewb;

                // finish initializing our page and render
                await loadAndSetCard();

                if (isShowingTutorial) {
                    setSampleDataset();
                }
            } catch (error) {
                console.log('error getting database list', error);
            }
        }

        init();
    }
]);
