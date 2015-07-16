'use strict';
/*global _, document, confirm*/

import DataReference from '../query_builder/data_reference.react';
import GuiQueryEditor from '../query_builder/gui_query_editor.react';
import NativeQueryEditor from '../query_builder/native_query_editor.react';
import QueryHeader from '../query_builder/header.react';
import QueryVisualization from '../query_builder/visualization.react';

import Query from '../query_builder/query';
import { serializeCardForUrl, deserializeCardFromUrl, cleanCopyCard, urlForCardState } from './card.util';

//  Card Controllers
var CardControllers = angular.module('corvus.card.controllers', []);

CardControllers.controller('CardList', ['$scope', '$location', 'Card', function($scope, $location, Card) {

    // $scope.cards: the list of cards being displayed

    $scope.deleteCard = function(cardId) {
        Card.delete({
            'cardId': cardId
        }, function(result) {
            $scope.cards = _.filter($scope.cards, function(card) {
                return card.id != cardId;
            });
            $scope.searchFilter = undefined;
        });
    };

    $scope.unfavorite = function(unfavIdx) {
        var cardToUnfav = $scope.cards[unfavIdx];
        Card.unfavorite({
            'cardId': cardToUnfav.id
        }, function(result) {
            $scope.cards.splice(unfavIdx, 1);
        });
    };

    $scope.filter = function(filterMode) {
        $scope.filterMode = filterMode;

        Card.list({
            'filterMode': filterMode
        }, function(cards) {
            $scope.cards = cards;
        }, function(error) {
            console.log('error getting cards list', error);
        });
    };

    $scope.inlineSave = function(card, idx) {
        Card.update(card, function(result) {
            if (result && !result.error) {
                $scope.cards[idx] = result;
            } else {
                return "error";
            }
        });
    };

    // determine the appropriate filter to start with
    if ($scope.hash && $scope.hash === 'fav') {
        $scope.filter('fav');
    } else {
        $scope.filter('all');
    }

}]);

CardControllers.controller('CardDetail', [
    '$rootScope', '$scope', '$route', '$routeParams', '$location', '$q', '$window', '$timeout', 'Card', 'Dashboard', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($rootScope, $scope, $route, $routeParams, $location, $q, $window, $timeout, Card, Dashboard, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {
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
                    aggregation: [null],
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

        savedCardSerialized = serializeCardForUrl(card);


        // =====  REACT component models

        var headerModel = {
            card: null,
            cardApi: Card,
            dashboardApi: Dashboard,
            broadcastEventFn: function(eventName, value) {
                $rootScope.$broadcast(eventName, value);
            },
            notifyCardChangedFn: function(modifiedCard) {
                // these are the only things we let the header change
                card.name = modifiedCard.name;
                card.description = modifiedCard.description;
                card.public_perms = modifiedCard.public_perms;

                renderAll();

                // this looks a little hokey, but its preferrable to setup our functions as promises so that callers can
                // be certain when they have been resolved.
                var deferred = $q.defer();
                deferred.resolve();
                return deferred.promise;
            },
            notifyCardCreatedFn: function(newCard) {
                setCard(newCard, { resetDirty: true, replaceState: true });
            },
            notifyCardUpdatedFn: function(updatedCard) {
                setCard(updatedCard, { resetDirty: true, replaceState: true });
            },
            setQueryModeFn: function(mode) {
                if (!card.dataset_query.type || mode !== card.dataset_query.type) {

                    resetCardQuery(mode);

                    renderAll();
                }
            },
            notifyCardDeletedFn: function () {
                $location.path('/');
            },
            cloneCardFn: function() {
                $scope.$apply(() => {
                    delete card.id;
                    setCard(card, { setDirty: true, replaceState: false })
                });
            },
            toggleDataReferenceFn: toggleDataReference,
            cardIsNewFn: cardIsNew,
            cardIsDirtyFn: cardIsDirty
        };

        var editorModel = {
            isRunning: false,
            isExpanded: true,
            databases: null,
            tables: null,
            options: null,
            tableForeignKeys: null,
            query: null,
            runQueryFn: runQuery,
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
                    runQuery(card.dataset_query);
                }
            },
            cellIsClickableFn: function(rowIndex, columnIndex) {
                if (!queryResult) return false;

                // lookup the coldef and cell value of the cell we are curious about
                var coldef = queryResult.data.cols[columnIndex],
                    value = queryResult.data.rows[rowIndex][columnIndex];

                if (!coldef || !coldef.special_type) return false;

                if (coldef.special_type === 'id' || (coldef.special_type === 'fk' && coldef.target)) {
                    return true;
                } else {
                    return false;
                }
            },
            cellClickedFn: function(rowIndex, columnIndex) {
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
                    runQuery(card.dataset_query);

                } else if (coldef.special_type === "fk") {
                    // action is on an FK column
                    resetCardQuery("query");

                    card.dataset_query.query.source_table = coldef.target.table_id;
                    card.dataset_query.query.aggregation = ["rows"];
                    card.dataset_query.query.filter = ["AND", ["=", coldef.target.id, value]];

                    // load table metadata now that we are switching to a new table
                    loadTableInfo(card.dataset_query.query.source_table);

                    // run it
                    runQuery(card.dataset_query);
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
                runQuery(card.dataset_query);
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
            headerModel.isShowingDataReference = $scope.isShowingDataReference;

            if (queryResult && !queryResult.error) {
                headerModel.downloadLink = '/api/meta/dataset/csv?query=' + encodeURIComponent(JSON.stringify(card.dataset_query));
            } else {
                headerModel.downloadLink = null;
            }

            React.render(<QueryHeader {...headerModel}/>, document.getElementById('react_qb_header'));
        }

        function renderEditor() {
            // ensure rendering model is up to date
            editorModel.isRunning = isRunning;
            editorModel.databases = databases;
            editorModel.tables = tables;
            editorModel.options = tableMetadata;
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

        function runQuery(dataset_query) {
            Query.cleanQuery(dataset_query.query);
            isRunning = true;

            updateUrl();

            renderAll();

            // make our api call
            var firstRunNewCard = (queryResult === null && card.id === undefined);
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
                        dataset_query.query.aggregation[0] === "rows") {
                    // if our query aggregation is "rows" then ALWAYS set the display to "table"
                    card.display = "table";
                }

                renderAll();

            }, function (error) {
                isRunning = false;
                // TODO: we should update the api so that we get better error messaging from the api on query fails
                queryResult = {
                    error: "Oh snap!  Something went wrong running your query :sad:"
                };

                renderAll();
            });
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
                    return markupTableMetadata(table);
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
            var updatedTable = CorvusFormGenerator.addValidOperatorsToFields(table);
            return QueryUtils.populateQueryOptions(updatedTable);
        }

        function toggleDataReference() {
            $scope.$apply(function() {
                $scope.isShowingDataReference = !$scope.isShowingDataReference;
                renderAll();
                // render again after 500ms to wait for animation to complete
                // FIXME: if previous render takes too long this is missed
                window.setTimeout(renderAll, 500);
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
            }
        }

        function loadSavedCard(cardId) {
            return Card.get({ 'cardId': cardId }).$promise;
        }

        function loadSerializedCard(serialized) {
            var card = deserializeCardFromUrl(serialized);
            // consider this since it's not saved:
            card.dirty = true;
            return $q.resolve(card);
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
            }

            savedCardSerialized = serializeCardForUrl(card);

            return $q.resolve(card);
        }

        function loadCard() {
            if ($routeParams.cardId != undefined) {
                return loadSavedCard($routeParams.cardId).then(function(result) {
                    if ($routeParams.serializedCard) {
                        return loadSerializedCard($routeParams.serializedCard).then(function(result2) {
                            return _.extend(result, result2);
                        });
                    } else {
                        return result;
                    }
                });
            } else if ($routeParams.serializedCard != undefined) {
                return loadSerializedCard($routeParams.serializedCard);
            } else {
                return loadNewCard();
            }
        }

        function setCard(result, options = {}) {
            // when loading an existing card for viewing, mark when the card creator is our current user
            // TODO: there may be a better way to maintain this, but it seemed worse to inject currentUser
            //       into a bunch of our react models and then bury this conditional in react component code
            if (result.creator_id === $scope.user.id) {
                result.is_creator = true;
            }

            // update our react models as needed
            card = result;

            if (options.resetDirty) {
                savedCardSerialized = serializeCardForUrl(card);
            }
            if (options.setDirty) {
                savedCardSerialized = null;
            }

            updateUrl(options.replaceState);

            // load metadata
            loadDatabaseInfo(card.dataset_query.database);

            if (card.dataset_query.type === "query" && card.dataset_query.query.source_table) {
                loadTableInfo(card.dataset_query.query.source_table);
            }

            // run the query
            if (Query.canRun(card.dataset_query.query)) {
                runQuery(card.dataset_query);
            }

            // trigger full rendering
            renderAll();
        }

        // meant to be called once on controller startup
        function loadAndSetCard() {
            loadCard().then(function (result) {
                // HACK: dirty status passed in the object itself, delete it
                var isDirty = result.dirty;
                delete result.dirty;
                return setCard(result, { setDirty: isDirty, resetDirty: !isDirty, replaceState: true });
            }, function (error) {
                if (error.status == 404) {
                    // TODO() - we should redirect to the card builder with no query instead of /
                    $location.path('/');
                }
            });
        }

        function cardIsNew() {
            return !card.id;
        }

        function cardIsDirty() {
            var newCardSerialized = serializeCardForUrl(card);

            return newCardSerialized !== savedCardSerialized;
        }

        // needs to be performed asynchronously otherwise we get weird infinite recursion
        var updateUrl = _.debounce(function(replaceState) {
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
            if (replaceState || (window.history.state && window.history.state.serializedCard === newState.serializedCard)) {
                console.log(">>> replaceState", history.length, newState, url);
                window.history.replaceState(newState, null, url);
            } else {
                console.log(">>> pushState", history.length, newState, url);
                window.history.pushState(newState, null, url);
            }
        }, 0);

        function popStateListener(e) {
            if (e.state && e.state.card) {
                console.log(">>> popState");
                e.preventDefault();
                setCard(e.state.card, {});
            }
        }

        // add popstate listener to support undo/redo via browser history
        window.addEventListener("popstate", popStateListener, false);

        $scope.$on("$destroy", function() {
            window.removeEventListener("popstate", popStateListener, false);

            // any time we route away from the query builder force unmount our react components to make sure they have a chance
            // to fully clean themselves up and remove things like popover elements which may be on the screen
            React.unmountComponentAtNode(document.getElementById('react_qb_header'));
            React.unmountComponentAtNode(document.getElementById('react_qb_editor'));
            React.unmountComponentAtNode(document.getElementById('react_qb_viz'));
        });

        // When the window is resized we need to re-render, mainly so that our visualization pane updates
        // Debounce the function to improve resizing performance.
        angular.element($window).bind('resize', _.debounce(function() {
            renderAll();
        }, 400));

        // mildly hacky way to prevent reloading controllers as the URL changes
        var route = $route.current;
        $scope.$on('$locationChangeSuccess', function (event) {
            var newParams = $route.current.params;
            var oldParams = route.params;

            // reload the controller if:
            // 1. not CardDetail
            // 2. both serializedCard and cardId are not set (new card)
            if ($route.current.$$route.controller === 'CardDetail' && (newParams.serializedCard || newParams.cardId)) {
                var params = $route.current.params;
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
        Metabase.db_list(function (dbs) {
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
