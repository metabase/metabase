'use strict';
/*global _, document, confirm, QueryHeader, NativeQueryEditor, GuiQueryEditor, ResultQueryEditor, QueryVisualization*/

//  Card Controllers
var CardControllers = angular.module('corvus.card.controllers', ['corvusadmin.query.services']);

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

        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            Card.list({
                'orgId': org.id,
                'filterMode': filterMode
            }, function(cards) {
                $scope.cards = cards;
            }, function(error) {
                console.log('error getting cards list', error);
            });
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
    '$scope', '$routeParams', '$location', '$q', 'Card', 'Dashboard', 'Query', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($scope, $routeParams, $location, $q, Card, Dashboard, Query, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {

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

        var queryResult = null,
            databases = null,
            isRunning = false,
            card = {
                name: null,
                public_perms: 0,
                display: "table",
                visualization_settings: VisualizationSettings.getSettingsForVisualization({}, "table"),
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
                $location.path('/' + $scope.currentOrg.slug + '/card/' + newCard.id);
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
                        queryTemplate.database = databases[0].id;
                    }


                    // apply the new query to our card
                    card.dataset_query = queryTemplate;

                    // clear out any visualization and reset to defaults
                    queryResult = null;
                    card.display = "table";
                    card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, card.display);

                    renderAll();
                }
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

                    // if this is our first run on a NEW card then try a little logic to pick a smart display for the data
                    if (firstRunNewCard &&
                            queryResult.data.rows &&
                            queryResult.data.rows.length === 1 &&
                            queryResult.data.columns.length === 1) {
                        // if we have a 1x1 data result then this should be viewed as a scalar
                        card.display = "scalar";

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
            card: null,
            result: null,
            isRunning: false,
            setDisplayFn: function(type) {
                // change the card visualization type and refresh chart settings
                card.display = type;
                card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, type);

                if (type === "pin_map") {
                    // identify the lat/lon columns from our data and make them part of the viz settings so we can render maps
                    card.visualization_settings = VisualizationSettings.setLatitudeAndLongitude(card.visualization_settings, queryResult.data.cols);
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
            } else if (card.dataset_query && card.dataset_query.type === "result") {
                // TODO: legacy stuff to be EOLed
                var queryLink = "/"+$scope.currentOrg.slug+"/admin/query/"+card.dataset_query.result.query_id+"/modify";
                var resultEditorModel = {
                    queryLink: queryLink
                };
                React.render(new ResultQueryEditor(resultEditorModel), document.getElementById('react_qb_editor'));
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
                    result.organization = $scope.currentOrg.id;
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

            } else if ($routeParams.queryId) {
                // @legacy ----------------------
                // someone looking to create a card from a query
                Query.get({
                    'queryId': $routeParams.queryId
                }, function (query) {
                    card.organization = $scope.currentOrg.id;
                    card.name = query.name;
                    card.dataset_query = {
                        'database': query.database.id,
                        'type': 'result',
                        'result': {
                            'query_id': query.id
                        }
                    };
                    cardJson = JSON.stringify(card);

                    editorModel.runFn(card.dataset_query);

                    renderAll();

                }, function (error) {
                    if (error.status == 404) {
                        $location.path('/');
                        return;
                    }
                    // TODO: need to handle this better
                    console.log('error getting query', error);
                });

            } else {
                // starting a new card
                card.organization = $scope.currentOrg.id;

                // this is just an easy way to ensure defaults are all setup
                headerModel.setQueryModeFn("query");

                cardJson = JSON.stringify(card);

                renderAll();
            }
        };

        $scope.$on('$locationChangeStart', function (event) {
            if (cardJson !== JSON.stringify(card) && queryResult !== null) {
                if (!confirm('You have unsaved changes!  Click OK to discard changes and leave the page.')) {
                    event.preventDefault();
                    return;
                }
            }

            // any time we route away from the query builder force unmount our react components to make sure they have a chance
            // to fully clean themselves up and remove things like popover elements which may be on the screen
            React.unmountComponentAtNode(document.getElementById('react_qb_header'));
            React.unmountComponentAtNode(document.getElementById('react_qb_editor'));
            React.unmountComponentAtNode(document.getElementById('react_qb_viz'));
        });

        // TODO: we should get database list first, then do rest of setup
        //       because without databases this UI is meaningless
        $scope.$watch('currentOrg', function (org) {
            // we need org always, so we just won't do anything if we don't have one
            if (!org) {return;}

            // TODO: while we wait for the databases list we should put something on screen

            // grab our database list, then handle the rest
            Metabase.db_list({
                'orgId': org.id
            }, function (dbs) {
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

        });
    }
]);