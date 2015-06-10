'use strict';
/*global _, document, confirm*/

import GuiQueryEditor from '../query_builder/gui_query_editor.react';
import NativeQueryEditor from '../query_builder/native_query_editor.react';
import QueryHeader from '../query_builder/header.react';
import QueryVisualization from '../query_builder/visualization.react';

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

    window.scope = $scope;

}]);

CardControllers.controller('CardDetail', [
    '$scope', '$routeParams', '$location', '$q', 'Card', 'Dashboard', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($scope, $routeParams, $location, $q, Card, Dashboard, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {

        // =====  Controller local objects

        var newQueryTemplates = {
            "query": {
                database: parseInt($routeParams.db) || null,
                type: "query",
                query: {
                    source_table: parseInt($routeParams.table) || null,
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

        var queryResult = null,
            databases = null,
            isRunning = false,
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
                var queryTemplate = angular.copy(newQueryTemplates[mode]);
                if ((!card.dataset_query.type ||
                    mode !== card.dataset_query.type) &&
                    queryTemplate) {

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

                    renderAll();
                }
            },
            notifyCardDeletedFn: function () {
                $location.path('/')
            }
        };

        var editorModel = {
            isRunning: false,
            databases: null,
            defaultQuery: null,
            query: null,
            initialQuery: null,
            getTablesFn: function(databaseId) {
                var apiCall = Metabase.db_tables({
                    'dbId': databaseId
                });
                return apiCall.$promise;
            },
            getTableDetailsFn: function(tableId) {
                var apiCall = Metabase.table_query_metadata({
                    'tableId': tableId
                });
                return apiCall.$promise;
            },
            markupTableFn: function(table) {
                // TODO: would be better if this was in the component
                var updatedTable = CorvusFormGenerator.addValidOperatorsToFields(table);
                return QueryUtils.populateQueryOptions(updatedTable);
            },
            runFn: function(dataset_query) {
                isRunning = true;
                renderAll();

                // make our api call
                var firstRunNewCard = (queryResult === null && card.id === undefined);
                Metabase.dataset(dataset_query, function (result) {
                    queryResult = result;
                    isRunning = false;

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
            }
        };

        var visualizationModel = {
            visualizationSettingsApi: VisualizationSettings,
            card: null,
            result: null,
            isRunning: false,
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
            editorModel.isRunning = isRunning;
            editorModel.databases = databases;
            editorModel.query = card.dataset_query;
            editorModel.defaultQuery = angular.copy(newQueryTemplates[card.dataset_query.type]);

            if (card.dataset_query && card.dataset_query.type === "native") {
                React.render(new NativeQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            } else {
                React.render(new GuiQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            }
        };

        var renderVisualization = function() {
            // ensure rendering model is up to date
            visualizationModel.card = angular.copy(card);
            visualizationModel.result = queryResult;
            visualizationModel.isRunning = isRunning;

            React.render(new QueryVisualization(visualizationModel), document.getElementById('react_qb_viz'));
        };

        var renderAll = function() {
            renderHeader();
            renderEditor();
            renderVisualization();
        };


        // =====  Local helper functions

        var loadCardAndRender = function(cardId, cloning) {
            Card.get({
                'cardId': cardId
            }, function (result) {
                if (cloning) {
                    result.id = undefined; // since it's a new card
                    result.carddirty = true; // so it cand be saved right away
                }

                // update our react models as needed
                card = result;
                cardJson = JSON.stringify(card);

                // run the query
                // TODO: is there a case where we wouldn't want this?
                editorModel.runFn(card.dataset_query);

                // trigger full rendering
                renderAll();

            }, function (error) {
                if (error.status == 404) {
                    // TODO() - we should redirect to the card builder with no query instead of /
                    $location.path('/');
                }
            });
        };

        // meant to be called once on controller startup
        var initAndRender = function() {
            if ($routeParams.cardId) {
                loadCardAndRender($routeParams.cardId, false);

            } else if ($routeParams.clone) {
                loadCardAndRender($routeParams.cardId, true);

            } else {
                // starting a new card

                // this is just an easy way to ensure defaults are all setup
                headerModel.setQueryModeFn("query");

                cardJson = JSON.stringify(card);

                renderAll();
            }
        };

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
