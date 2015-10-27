import React from "react";

import DataReference from '../query_builder/DataReference.jsx';
import GuiQueryEditor from '../query_builder/GuiQueryEditor.jsx';
import NativeQueryEditor from '../query_builder/NativeQueryEditor.jsx';
import QueryHeader from '../query_builder/QueryHeader.jsx';
import QueryVisualization from '../query_builder/QueryVisualization.jsx';

import SavedQuestionsApp from './containers/SavedQuestionsApp.jsx';

import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";
import _ from "underscore";

import MetabaseAnalytics from '../lib/analytics';
import DataGrid from "metabase/lib/data_grid";
import { addValidOperatorsToFields } from "metabase/lib/schema_metadata";

import Query from "metabase/lib/query";
import { serializeCardForUrl, deserializeCardFromUrl, cleanCopyCard, urlForCardState } from './card.util';

import * as reducers from './reducers';

const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
  ),
  createStore
);

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
    $scope.store = finalCreateStore(reducer, {});
}]);

CardControllers.controller('CardDetail', [
    '$rootScope', '$scope', '$route', '$routeParams', '$location', '$q', '$window', '$timeout', 'Card', 'Dashboard', 'Metabase', 'VisualizationSettings', 'QueryUtils', 'Revision',
    function($rootScope, $scope, $route, $routeParams, $location, $q, $window, $timeout, Card, Dashboard, Metabase, VisualizationSettings, QueryUtils, Revision) {
        // promise helper
        $q.resolve = function(object) {
            var deferred = $q.defer();
            deferred.resolve(object);
            return deferred.promise;
        }

        // =====  Controller local objects

        var newQueryTemplates = {
            "query": {
                database: null,
                type: "query",
                query: {
                    source_table: null,
                    aggregation: ["rows"],
                    breakout: [],
                    filter: []
                }
            },
            "native": {
                database: null,
                type: "native",
                native: {
                    query: ""
                }
            }
        };

        $scope.isShowingDataReference = false;

        var queryResult = null,
            databases = null,
            tables = null,
            tableMetadata = null,
            tableForeignKeys = null,
            tableForeignKeyReferences = null,
            isRunning = false,
            isObjectDetail = false,
            card = {
                name: null,
                public_perms: 0,
                display: "table",
                visualization_settings: {},
                dataset_query: {},
            },
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
            notifyCardChangedFn: async function(modifiedCard) {
                // these are the only things we let the header change
                card.name = modifiedCard.name;
                card.description = modifiedCard.description;
                card.public_perms = modifiedCard.public_perms;

                renderAll();
            },
            notifyCardCreatedFn: function(newCard) {
                setCard(newCard, { resetDirty: true, replaceState: true });

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Create Card', newCard.dataset_query.type);
            },
            notifyCardUpdatedFn: function(updatedCard) {
                setCard(updatedCard, { resetDirty: true, replaceState: true });

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Update Card', updatedCard.dataset_query.type);
            },
            notifyCardAddedToDashFn: function(dashCard) {
                $scope.$apply(() => $location.path('/dash/'+dashCard.dashboard_id));
            },
            setQueryModeFn: function(mode) {
                if (!card.dataset_query.type || mode !== card.dataset_query.type) {

                    resetCardQuery(mode);
                    resetDirty();
                    updateUrl();

                    renderAll();
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
            setQueryFn: setQuery,
            setDatabaseFn: setDatabase,
            setSourceTableFn: setSourceTable,
            autocompleteResultsFn: function(prefix) {
                var apiCall = Metabase.db_autocomplete_suggestions({
                    dbId: card.dataset_query.database,
                    prefix: prefix
                });
                return apiCall.$promise;
            },
            toggleExpandCollapseFn: function() {
                editorModel.isExpanded = !editorModel.isExpanded;
                renderAll();
            }
        };

        var visualizationModel = {
            visualizationSettingsApi: VisualizationSettings,
            card: null,
            result: null,
            tableForeignKeys: null,
            tableForeignKeyReferences: null,
            isRunning: false,
            runQueryFn: runQuery,
            isObjectDetail: false,
            setDisplayFn: setDisplay,
            setChartColorFn: function(color) {
                var vizSettings = card.visualization_settings;

                // if someone picks the default color then clear any color settings
                if (color === VisualizationSettings.getDefaultColor()) {
                    // NOTE: this only works if setting color is the only option we allow
                    card.visualization_settings = {};

                } else {
                    // this really needs to be better
                    var lineSettings = (vizSettings.line) ? vizSettings.line : {};
                    var areaSettings = (vizSettings.area) ? vizSettings.area : {};
                    var barSettings = (vizSettings.bar) ? vizSettings.bar : {};

                    lineSettings.lineColor = color;
                    lineSettings.marker_fillColor = color;
                    lineSettings.marker_lineColor = color;
                    areaSettings.fillColor = color;
                    barSettings.color = color;

                    vizSettings.line = lineSettings;
                    vizSettings.area = areaSettings;
                    vizSettings.bar = barSettings;
                }

                renderAll();
            },
            setSortFn: function(fieldId) {
                // for now, just put this into the query and re-run
                var sortField = fieldId;
                if (fieldId === "agg") {
                    sortField = ["aggregation", 0];
                }

                // NOTE: we only allow this for structured type queries & we only allow sorting by a single column
                if (card.dataset_query.type === "query") {
                    var sortClause = [sortField, "ascending"];
                    if (card.dataset_query.query.order_by !== undefined &&
                            card.dataset_query.query.order_by.length > 0 &&
                            card.dataset_query.query.order_by[0].length > 0 &&
                            card.dataset_query.query.order_by[0][1] === "ascending" &&
                            (card.dataset_query.query.order_by[0][0] === sortField ||
                                (Array.isArray(card.dataset_query.query.order_by[0][0]) &&
                                    Array.isArray(sortField)))) {
                        // someone triggered another sort on the same column, so flip the sort direction
                        sortClause = [sortField, "descending"];
                    }

                    // set clause
                    card.dataset_query.query.order_by = [sortClause];

                    // run updated query
                    runQuery();
                }
            },
            cellIsClickableFn: function(rowIndex, columnIndex) {
                if (!queryResult) return false;

                // lookup the coldef and cell value of the cell we are curious about
                var coldef = queryResult.data.cols[columnIndex];

                if (!coldef || !coldef.special_type) return false;

                if (coldef.special_type === 'id' || (coldef.special_type === 'fk' && coldef.target)) {
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
                    resetCardQuery("query");

                    card.dataset_query.query.source_table = coldef.table_id;
                    card.dataset_query.query.aggregation = ["rows"];
                    card.dataset_query.query.filter = ["AND", ["=", coldef.id, value]];

                    // run it
                    runQuery();

                } else if (coldef.special_type === "fk") {
                    // action is on an FK column
                    resetCardQuery("query");

                    card.dataset_query.query.source_table = coldef.target.table_id;
                    card.dataset_query.query.aggregation = ["rows"];
                    card.dataset_query.query.filter = ["AND", ["=", coldef.target.id, value]];

                    // load table metadata now that we are switching to a new table
                    loadTableInfo(card.dataset_query.query.source_table);

                    // run it
                    runQuery();
                } else {
                    Query.addFilter(card.dataset_query.query);
                    Query.updateFilter(card.dataset_query.query, card.dataset_query.query.filter.length - 1, [filter, coldef.id, value]);
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
                resetCardQuery("query");

                card.dataset_query.query.source_table = fk.origin.table.id;
                card.dataset_query.query.aggregation = ["rows"];
                card.dataset_query.query.filter = ["AND", ["=", fk.origin.id, originValue]];

                // load table metadata now that we are switching to a new table
                loadTableInfo(card.dataset_query.query.source_table);

                // run it
                runQuery();
            }
        };

        var dataReferenceModel = {
            Metabase: Metabase,
            closeFn: toggleDataReference,
            runQueryFn: runQuery,
            setQueryFn: setQuery,
            setDatabaseFn: setDatabase,
            setSourceTableFn: setSourceTable,
            setDisplayFn: setDisplay,
            loadTableFn: loadTable
        };

        // =====  REACT render functions

        function renderHeader() {
            // ensure rendering model is up to date
            headerModel.card = angular.copy(card);
            headerModel.tableMetadata = tableMetadata;
            headerModel.isShowingDataReference = $scope.isShowingDataReference;

            React.render(<QueryHeader {...headerModel}/>, document.getElementById('react_qb_header'));
        }

        function renderEditor() {
            // ensure rendering model is up to date
            editorModel.isRunning = isRunning;
            editorModel.isShowingDataReference = $scope.isShowingDataReference;
            editorModel.databases = databases;
            editorModel.tableMetadata = tableMetadata;
            editorModel.tableForeignKeys = tableForeignKeys;
            editorModel.query = card.dataset_query;

            if (card.dataset_query && card.dataset_query.type === "native") {
                React.render(<NativeQueryEditor {...editorModel}/>, document.getElementById('react_qb_editor'));
            } else {
                React.render(<GuiQueryEditor {...editorModel}/>, document.getElementById('react_qb_editor'));
            }
        }

        function renderVisualization() {
            // ensure rendering model is up to date
            visualizationModel.card = angular.copy(card);
            visualizationModel.result = queryResult;
            visualizationModel.tableMetadata = tableMetadata;
            visualizationModel.tableForeignKeys = tableForeignKeys;
            visualizationModel.tableForeignKeyReferences = tableForeignKeyReferences;
            visualizationModel.isRunning = isRunning;
            visualizationModel.isObjectDetail = isObjectDetail;

            if (queryResult && !queryResult.error) {
                visualizationModel.downloadLink = '/api/dataset/csv?query=' + encodeURIComponent(JSON.stringify(card.dataset_query));
            } else {
                visualizationModel.downloadLink = null;
            }

            React.render(<QueryVisualization {...visualizationModel}/>, document.getElementById('react_qb_viz'));
        }

        function renderDataReference() {
            dataReferenceModel.databases = databases;
            dataReferenceModel.query = card.dataset_query;
            React.render(<DataReference {...dataReferenceModel}/>, document.getElementById('react_data_reference'));
        }

        var renderAll = _.debounce(function() {
            renderHeader();
            renderEditor();
            renderVisualization();
            renderDataReference();
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
                        var fkQuery = angular.copy(newQueryTemplates["query"]);
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
        }

        function getDefaultQuery() {
            return angular.copy(newQueryTemplates[card.dataset_query.type]);
        }

        function loadTable(tableId) {
            return $q.all([
                Metabase.table_query_metadata({
                    'tableId': tableId
                }).$promise.then(function (table) {
                    // Decorate with valid operators
                    // TODO: would be better if this was in our component
                    table = markupTableMetadata(table);
                    // Load joinable tables
                    return $q.all(table.fields.filter((f) => f.target != null).map((field) => {
                        return Metabase.table_query_metadata({
                            'tableId': field.target.table_id
                        }).$promise.then((targetTable) => {
                            field.target.table = markupTableMetadata(targetTable);
                        });
                    })).then(() => table);
                }),
                Metabase.table_fks({
                    'tableId': tableId
                }).$promise
            ]).then(function(results) {
                return {
                    metadata: results[0],
                    foreignKeys: results[1]
                }
            });
        }

        function loadTableInfo(tableId) {
            if (tableMetadata && tableMetadata.id === tableId) {
                return;
            }

            tableMetadata = null;
            tableForeignKeys = null;

            loadTable(tableId).then(function (results) {
                tableMetadata = results.metadata;
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

        function setDatabase(databaseId) {
            if (databaseId !== card.dataset_query.database) {
                // reset to a brand new query
                var query = getDefaultQuery();

                // set our new database on the query
                query.database = databaseId;

                // carry over our previous query if we had one
                if (card.dataset_query.native) {
                    query.native.query = card.dataset_query.native.query;
                }

                // TODO: should this clear the visualization as well?
                setQuery(query);

                // load rest of the data we need
                loadDatabaseInfo(databaseId);
            }
            return card.dataset_query;
        }

        function setSourceTable(sourceTable) {
            // this will either be the id or an object with an id
            var tableId = sourceTable.id || sourceTable;
            if (tableId !== card.dataset_query.query.source_table) {

                // when the table changes we reset everything else in the query, except the database of course
                // TODO: should this clear the visualization as well?
                var query = getDefaultQuery();
                query.database = card.dataset_query.database;
                query.query.source_table = tableId;

                setQuery(query);

                loadTableInfo(tableId);
            }
            return card.dataset_query;
        }

        function setQuery(dataset_query) {
            // we are being told that the query has been modified
            card.dataset_query = dataset_query;
            renderAll();
            return card.dataset_query;
        }

        function setDisplay(type) {
            card.display = type;
            renderAll();
        }

        function isObjectDetailQuery(card, data) {
            var response = false;

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

        function markupTableMetadata(table) {
            var updatedTable = addValidOperatorsToFields(table);
            return QueryUtils.populateQueryOptions(updatedTable);
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

        function resetCardQuery(mode) {
            var queryTemplate = angular.copy(newQueryTemplates[mode]);
            if (queryTemplate) {

                // carry over currently selected database to new query, if possible
                // otherwise try to set the database to a sensible default
                if (card.dataset_query.database !== undefined &&
                    card.dataset_query.database !== null) {
                    queryTemplate.database = card.dataset_query.database;
                } else if (databases && databases.length > 0) {
                    // TODO: be smarter about this and use the most recent or popular db
                    queryTemplate.database = parseInt($routeParams.db) || databases[0].id;
                }

                // apply the new query to our card
                card.dataset_query = queryTemplate;

                // clear out any visualization and reset to defaults
                queryResult = null;
                card.display = "table";

                MetabaseAnalytics.trackEvent('QueryBuilder', 'Query Started', mode);
            }
        }

        function loadSavedCard(cardId) {
            return Card.get({ 'cardId': cardId }).$promise;
        }

        function loadSerializedCard(serialized) {
            var card = deserializeCardFromUrl(serialized);
            // consider this since it's not saved:
            card.isDirty = true;
            return card;
        }

        function loadNewCard() {
            // show data reference
            // $scope.isShowingDataReference = true;

            // this is just an easy way to ensure defaults are all setup
            resetCardQuery("query");

            // initialize the table & db from our query params, if we have them
            if ($routeParams.db != undefined) {
                card.dataset_query.database = parseInt($routeParams.db);
            }
            if ($routeParams.table != undefined && card.dataset_query.query) {
                card.dataset_query.query.source_table = parseInt($routeParams.table);
                card.isDirty = true;
            }

            return card;
        }

        async function loadCard() {
            if ($routeParams.cardId != undefined) {
                var card = await loadSavedCard($routeParams.cardId);
                if ($routeParams.serializedCard) {
                    let serializedCard = await loadSerializedCard($routeParams.serializedCard);
                    return _.extend(card, serializedCard);
                } else {
                    return card;
                }
            } else if ($routeParams.serializedCard != undefined) {
                return loadSerializedCard($routeParams.serializedCard);
            } else {
                return loadNewCard();
            }
        }

        function setCard(result, options = {}) {
            // update our react models as needed
            card = result;

            if (options.resetDirty) {
                resetDirty();
            }
            if (options.setDirty) {
                setDirty();
            }

            updateUrl(options.replaceState);

            // load metadata
            loadDatabaseInfo(card.dataset_query.database);

            if (card.dataset_query.type === "query" && card.dataset_query.query.source_table) {
                loadTableInfo(card.dataset_query.query.source_table);
            }

            // run the query
            if (Query.canRun(card.dataset_query.query) || card.dataset_query.type === "native") {
                runQuery();
            }

            // trigger full rendering
            renderAll();
        }

        // meant to be called once on controller startup
        async function loadAndSetCard() {
            try {
                let card = await loadCard();
                if ($routeParams.clone) {
                    delete card.id;
                    card.isDirty = true;
                }
                // HACK: dirty status passed in the object itself, delete it
                let isDirty = !!card.isDirty;
                delete card.isDirty;
                return setCard(card, { setDirty: isDirty, resetDirty: !isDirty, replaceState: true });
            } catch (error) {
                if (error.status == 404) {
                    // TODO() - we should redirect to the card builder with no query instead of /
                    $location.path('/');
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
            delete $routeParams.serializedCard;
            loadAndSetCard();
        }

        // needs to be performed asynchronously otherwise we get weird infinite recursion
        var updateUrl = (replaceState) => setTimeout(function() {
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
            if (replaceState) {
                window.history.replaceState(newState, null, url);
            } else {
                window.history.pushState(newState, null, url);
            }
        }, 0);

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
            React.unmountComponentAtNode(document.getElementById('react_qb_header'));
            React.unmountComponentAtNode(document.getElementById('react_qb_editor'));
            React.unmountComponentAtNode(document.getElementById('react_qb_viz'));
            React.unmountComponentAtNode(document.getElementById('react_data_reference'));
        });


        // mildly hacky way to prevent reloading controllers as the URL changes
        var route = $route.current;
        $scope.$on('$locationChangeSuccess', function (event) {
            var newParams = $route.current.params;
            var oldParams = route.params;

            // reload the controller if:
            // 1. not CardDetail
            // 2. both serializedCard and cardId are not set (new card)
            if ($route.current.$$route.controller === 'CardDetail' && (newParams.serializedCard || newParams.cardId)) {
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

        // TODO: while we wait for the databases list we should put something on screen
        // grab our database list, then handle the rest
        async function loadDatabasesAndTables() {
            let dbs = await Metabase.db_list().$promise;
            return await * dbs.map(async function(db) {
                db.tables = await Metabase.db_tables({ dbId: db.id }).$promise;
                return db;
            });
        }

        loadDatabasesAndTables().then(function(dbs) {
            databases = dbs;

            if (dbs.length < 1) {
                // TODO: some indication that setting up a db is required
                return;
            }

            // finish initializing our page and render
            loadAndSetCard();

        }, function (error) {
            console.log('error getting database list', error);
        });
    }
]);
