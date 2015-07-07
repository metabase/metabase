'use strict';
/*global _, document, confirm, console, moment*/

import GuiQueryEditor from '../query_builder/gui_query_editor.react';
import GAGuiQueryEditor from '../query_builder/ga_gui_query_editor.react';
import NativeQueryEditor from '../query_builder/native_query_editor.react';
import QueryHeader from '../query_builder/header.react';
import QueryVisualization from '../query_builder/visualization.react';
import GA from '../query_builder/ga.js';

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
    '$rootScope', '$scope', '$routeParams', '$location', '$q', '$window', 'Card', 'Dashboard', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($rootScope, $scope, $routeParams, $location, $q, $window, Card, Dashboard, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {

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
            },
            "ga": {
                type: "ga",
                profileId: null,
                propertyId: null,
                accountId: null,
                query: {
                    'ids': null,
                    'start-date': moment().subtract(1, 'weeks').startOf('isoWeek').format('YYYY-MM-DD'),
                    'end-date': moment().format('YYYY-MM-DD'),
                    'mertrics': '',  // GA API wants a , separated list of format 'ga:metric'
                    'dimensions': '' // GA API wants a , separated list of format 'ga:dimesion'
                }
            }
        };

        var queryResult = null,
            databases = null,
            tables = null,
            tableMetadata = null,
            tableForeignKeys = null,
            needsAuth = false,
            isRunning = false,
            isObjectDetail = false,
            card = {
                name: null,
                public_perms: 0,
                display: "table",
                visualization_settings: {},
                dataset_query: {},
            },
            cardJson = JSON.stringify(card);


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
                cardJson = JSON.stringify(card);

                // for new cards we redirect the user
                $location.path('/card/' + newCard.id);
            },
            notifyCardUpdatedFn: function(updatedCard) {
                cardJson = JSON.stringify(card);
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
            cloneCardFn: function(cardId) {
                $scope.$apply(() => $location.url('/card/create?clone='+cardId));
            }
        };

        var editorModel = {
            isRunning: false,
            isExpanded: true,
            databases: null,
            tables: null,
            options: null,
            tableForeignKeys: null,
            defaultQuery: null,
            query: null,
            initialQuery: null,
            loadDatabaseInfoFn: function(databaseId) {
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
            },
            loadTableInfoFn: function(tableId) {
                tableMetadata = null;
                tableForeignKeys = null;

                    // get table details
                    Metabase.table_query_metadata({
                        'tableId': tableId
                    }).$promise.then(function (table) {
                        // Decorate with valid operators
                        // TODO: would be better if this was in our component
                        var updatedTable = markupTableMetadata(table);

                        tableMetadata = updatedTable;

                        renderAll();
                    }, function (error) {
                        console.log('error getting table metadata', error);
                    });

                    // get table fks
                    Metabase.table_fks({
                        'tableId': tableId
                    }).$promise.then(function (fks) {
                        tableForeignKeys = fks;

                        renderAll();
                    }, function (error) {
                        console.log('error getting fks for table '+tableId, error);
                    });
            },
            runFn: function(dataset_query) {
                isRunning = true;
                renderAll();

                // make our api call
                var firstRunNewCard = (queryResult === null && card.id === undefined);
                Metabase.dataset(dataset_query, function (result) {
                    queryResult = result;
                    isRunning = false;

                    // do a quick test to see if we are meant to render and object detail view or normal results
                    if(isObjectDetailQuery(card, queryResult.data)) {
                        isObjectDetail = true;
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
            },
            notifyQueryModifiedFn: function(dataset_query) {
                // we are being told that the query has been modified
                card.dataset_query = dataset_query;
                renderAll();
            },
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

        window.card = card;

        var gaModel = {
            isRunning: false,
            isExpanded: true,
            properties: null,
            query: null,
            selectDimension: function (dimension) {
                card.dataset_query.query.dimensions = dimension.id;
                renderAll();
            },
            selectMetric: function (metric) {
                card.dataset_query.query.metrics = metric.id;
                renderAll();
            },
            selectSegment: function (segment) {
                card.dataset_query.query.segment = segment.segmentId;
                renderAll();
            },
            setAccountIdandProperyIdFn: function (accountId, propertyId) {
                card.dataset_query.accountId = accountId;
                card.dataset_query.propertyId = propertyId;
                renderAll();


                GA.queryProfiles(accountId, propertyId).then(function (result) {

                    card.dataset_query.profileId = result.items[0].id;
                    card.dataset_query.query.ids = 'ga:' + result.items[0].id;

                });

            },

            setStartDate: function (date) {
                console.log('change start', moment(date));
                card.dataset_query.query['start-date'] = date;
                renderAll();
            },
            setEndDate: function (date) {
                console.log('change end', moment(date));
                card.dataset_query.query['end-date'] = date;
                renderAll();
            },
            runFn: function(dataset_query) {
                isRunning = true;
                renderAll();

                // here we make a call to the GA core reporting api.
                GA.queryCoreReportingApi(card.dataset_query.query).then(function (result) {
                    console.log('query result from ga', result.result.rows);
                    var data = result.result.rows;
                    data = _.unzip(data);

                    var formattedColumns = [],
                        formattedRows = [],
                        formattedCols = [];

                    data.map(function (d, i) {
                        // if the array index is 0, then its the header
                       if(i === 0) {
                           for(var h in d) {
                               var header = d[h];
                               formattedColumns.push(header);
                               formattedCols.push({
                                   name: header
                               });
                           }
                       } else {
                           for(var r in d) {
                               console.log(d[r]);
                               formattedRows.push([d[r]]);
                           }
                       }
                   });


                    var formattedResult = {
                        data: {
                            rows: formattedRows,
                            cols: formattedCols,
                            columns: formattedColumns
                        }
                    };

                    window.formatted = formattedResult;

                    console.log('formatted', formattedResult);

                    queryResult = formattedResult;
                    isRunning = false;
                    card.display = "table";

                    renderAll();
                });
            },
        };

        var visualizationModel = {
            visualizationSettingsApi: VisualizationSettings,
            card: null,
            result: null,
            tableForeignKeys: null,
            isRunning: false,
            isObjectDetail: false,
            setDisplayFn: function(type) {
                card.display = type;

                renderAll();
            },
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
                    editorModel.runFn(card.dataset_query);
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
                    editorModel.runFn(card.dataset_query);

                } else if (coldef.special_type === "fk") {
                    // action is on an FK column
                    resetCardQuery("query");

                    card.dataset_query.query.source_table = coldef.target.table_id;
                    card.dataset_query.query.aggregation = ["rows"];
                    card.dataset_query.query.filter = ["AND", ["=", coldef.target.id, value]];

                    // load table metadata now that we are switching to a new table
                    editorModel.loadTableInfoFn(card.dataset_query.query.source_table);

                    // run it
                    editorModel.runFn(card.dataset_query);
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
                editorModel.loadTableInfoFn(card.dataset_query.query.source_table);

                // run it
                editorModel.runFn(card.dataset_query);
            }
        };


        // =====  REACT render functions

        var renderHeader = function() {
            // ensure rendering model is up to date
            headerModel.card = angular.copy(card);

            if (queryResult && !queryResult.error) {
                headerModel.downloadLink = '/api/meta/dataset/csv?query=' + encodeURIComponent(JSON.stringify(card.dataset_query));
            } else {
                headerModel.downloadLink = null;
            }

            React.render(new QueryHeader(headerModel), document.getElementById('react_qb_header'));
        };

        var renderEditor = function() {
            // ensure rendering model is up to date
            if(card.dataset_query && card.dataset_query.type === "ga") {
                gaModel.isRunning = isRunning;
                gaModel.query = card.dataset_query;
                gaModel.card = card;
            } else {
                editorModel.isRunning = isRunning;
                editorModel.databases = databases;
                editorModel.tables = tables;
                editorModel.options = tableMetadata;
                editorModel.tableForeignKeys = tableForeignKeys;
                editorModel.query = card.dataset_query;
                editorModel.defaultQuery = angular.copy(newQueryTemplates[card.dataset_query.type]);
            }

            if (card.dataset_query && card.dataset_query.type === "native") {
                React.render(new NativeQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            } else if (card.dataset_query && card.dataset_query.type === "ga") {
                React.render(new GAGuiQueryEditor(gaModel), document.getElementById('react_qb_editor'));
            } else {
                React.render(new GuiQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            }
        };

        var renderVisualization = function() {
            // ensure rendering model is up to date
            visualizationModel.card = angular.copy(card);
            visualizationModel.result = queryResult;
            visualizationModel.tableForeignKeys = tableForeignKeys;
            visualizationModel.isRunning = isRunning;
            visualizationModel.isObjectDetail = isObjectDetail;
            visualizationModel.needsAuth = needsAuth;
            visualizationModel.authGA = function (event) {
                GA.authorize(event).then(function (result) {
                   console.log('we be result?');
                   needsAuth = false;
                   gaInit();
               });
           };

            React.render(new QueryVisualization(visualizationModel), document.getElementById('react_qb_viz'));
        };

        var renderAll = function() {
            renderHeader();
            renderEditor();
            renderVisualization();
        };


        // =====  Local helper functions

        var isObjectDetailQuery = function(card, data) {
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
        };

        var markupTableMetadata = function(table) {
            var updatedTable = CorvusFormGenerator.addValidOperatorsToFields(table);
            return QueryUtils.populateQueryOptions(updatedTable);
        };

        var resetCardQuery = function(mode) {
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
        };

        var loadCardAndRender = function(cardId, cloning) {
            Card.get({
                'cardId': cardId
            }, function (result) {
                if (cloning) {
                    result.id = undefined; // since it's a new card
                    result.carddirty = true; // so it cand be saved right away
                } else {
                    // when loading an existing card for viewing, mark when the card creator is our current user
                    // TODO: there may be a better way to maintain this, but it seemed worse to inject currentUser
                    //       into a bunch of our react models and then bury this conditional in react component code
                    if (result.creator_id === $scope.user.id) {
                        result.is_creator = true;
                    }
                }

                // update our react models as needed
                card = result;
                cardJson = JSON.stringify(card);

                console.log(card);
                if(card.dataset_query.type === "ga") {
                    gaInit();
                } else {
                    // load metadata
                    editorModel.loadDatabaseInfoFn(card.dataset_query.database);

                    if (card.dataset_query.type === "query" && card.dataset_query.query.source_table) {
                        editorModel.loadTableInfoFn(card.dataset_query.query.source_table);
                    }


                    // run the query
                    // TODO: is there a case where we wouldn't want this?
                    editorModel.runFn(card.dataset_query);

                    // trigger full rendering

                }
                renderAll();

            }, function (error) {
                if (error.status == 404) {
                    // TODO() - we should redirect to the card builder with no query instead of /
                    $location.path('/');
                }
            });
        };

        function gaInit() {
            GA.authorize()
                .then(gaSetup)
                .catch(function (err) {
                   needsAuth = true;
                   console.log(err);
                   renderAll();
               });
        }

        function gaSetup() {
            GA.queryAccounts().then(function (result) {
                GA.queryProperties(result.items[0].id).then(function (result) {
                    console.log('properties results', result);
                    gaModel.properties = result.items;
                    renderAll();
                    GA.columnList().then(function (result) {
                       gaModel.metrics = result.metrics;
                       gaModel.dimensions = result.dimensions;
                       renderAll();
                    });
                    GA.querySegments().then(function (result) {
                        console.log(result.items)
                        gaModel.segments = result.items;
                       renderAll();
                   });
                });
            }).catch(function (err) {
               console.log('whoops');
           });
        }

        // meant to be called once on controller startup
        var initAndRender = function() {
            if ($routeParams.cardId) {
                loadCardAndRender($routeParams.cardId, false);

            } else if ($routeParams.clone) {
                loadCardAndRender($routeParams.clone, true);

            } else if ($routeParams.ga) {
                resetCardQuery("ga");
                gaInit();
            } else {
                // starting a new card

                // this is just an easy way to ensure defaults are all setup
                resetCardQuery("query");

                // initialize the table & db from our query params, if we have them
                if ($routeParams.db !== undefined) {
                    // do a quick validation that this user actually has access to the db from the url
                    for (var i=0; i < databases.length; i++) {
                        var databaseId = parseInt($routeParams.db);
                        if (databases[i].id === databaseId) {
                            card.dataset_query.database = databaseId;

                            // load metadata
                            editorModel.loadDatabaseInfoFn(card.dataset_query.database);
                        }
                    }

                    // if we initialized our database safely and we have a table, lets handle that now
                    if (card.dataset_query.database !== null && $routeParams.table !== undefined) {
                        // TODO: do we need a security check here?  seems that if they have access to the db just use the table
                        card.dataset_query.query.source_table = parseInt($routeParams.table);

                        // load table metadata
                        editorModel.loadTableInfoFn(card.dataset_query.query.source_table);
                    }
                }

                cardJson = JSON.stringify(card);

                renderAll();
            }
        };

        // When the window is resized we need to re-render, mainly so that our visualization pane updates
        // Debounce the function to improve resizing performance.
        angular.element($window).bind('resize', _.debounce(function() {
            renderAll();
        }, 400));

        $scope.$on('$locationChangeStart', function (event) {
            // only ask for a confirmation on unsaved changes if the question is
            // saved already, indicated by a cardId
            if($routeParams.cardId) {
                if (cardJson !== JSON.stringify(card) && queryResult !== null) {
                    if (!confirm('You have unsaved changes!  Click OK to discard changes and leave the page.')) {
                        event.preventDefault();
                        return;
                    }
                }
            }

            // any time we route away from the query builder force unmount our react components to make sure they have a chance
            // to fully clean themselves up and remove things like popover elements which may be on the screen
            React.unmountComponentAtNode(document.getElementById('react_qb_header'));
            React.unmountComponentAtNode(document.getElementById('react_qb_editor'));
            React.unmountComponentAtNode(document.getElementById('react_qb_viz'));
        });

        // TODO: while we wait for the databases list we should put something on screen
        // grab our database list, then handle the rest
        Metabase.db_list(function (dbs) {
            console.log("we be getting dbs no matter what?")
            databases = dbs;

            if (dbs.length < 1) {
                // TODO: some indication that setting up a db is required
                return;
            }

            // finish initializing our page and render
            initAndRender();

        }, function (error) {
            console.log('error getting database list', error);
        });
    }
]);
