'use strict';
/*global _*/
/* global addValidOperatorsToFields*/

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
    '$scope', '$routeParams', '$location', 'Card', 'Query', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($scope, $routeParams, $location, Card, Query, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {

        /*
           HERE BE DRAGONS

           this is the react query builder prototype. there are a few things to know:


           1. all hail the queryBuilder. it's what syncs up this controller and react. any time a value of the model changes,
              the react app will re-render with the new "state of the world" the model provides.

           2. the react app calls the functions in queryBuilder in order to interact with the backend

           3. many bits o' functionality related to mutating the query result or lookups have been moved to QueryUtils to keep this controller
              lighter weight and focused on communicating with the react app

        */

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

        var cardIsDirty = function() {
            return false;
        };


        // =====  REACT component models

        var headerModel = {
            card: {
                name: null,
                public_perms: 0,
                display: "table",
                dataset_query: null,
                isDirty: cardIsDirty
            },
            saveFn: function(settings) {
                headerModel.card.name = settings.name;
                headerModel.card.description = settings.description;
                // TODO: set permissions here

                if (headerModel.card.id !== undefined) {
                    Card.update(headerModel.card, function (updatedCard) {
                        // TODO: any reason to overwrite card and re-render?
                    }, function (error) {
                        console.log('error updating card', error);
                    });
                } else {
                    // set the organization
                    headerModel.card.organization = $scope.currentOrg.id;

                    Card.create(headerModel.card, function (newCard) {
                        $location.path('/' + $scope.currentOrg.slug + '/card/' + newCard.id);
                    }, function (error) {
                        console.log('error creating card', error);
                    });
                }
            },
            setPermissions: function(permission) {
                headerModel.card.public_perms = permission;
                renderHeader();
            },
            setQueryModeFn: function(mode) {
                var queryTemplate = angular.copy(newQueryTemplates[mode]);
                if ((!headerModel.card.dataset_query.type ||
                    mode !== headerModel.card.dataset_query.type) &&
                    queryTemplate) {

                    // carry over currently selected database to new query, if possible
                    // otherwise try to set the database to a sensible default
                    if (headerModel.card.dataset_query.database !== null) {
                        queryTemplate.database = headerModel.card.dataset_query.database;
                    } else if (editorModel.databases && editorModel.databases.length > 0) {
                        // TODO: be smarter about this and use the most recent or popular db
                        queryTemplate.database = editorModel.databases[0].id;
                    }


                    // apply the new query to our card
                    headerModel.card.dataset_query = queryTemplate;
                    editorModel.defaultQuery = queryTemplate;

                    // clear out any visualization and reset to defaults
                    visualizationModel.result = null;
                    headerModel.card.display = "table";
                    headerModel.card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, headerModel.card.display);

                    renderAll();
                }
            },
            getDownloadLink: function() {
                // TODO: this should be conditional and only return a valid url if we have valid
                //       data to be downloaded.  otherwise return something falsey
                if (queryResult) {
                    return '/api/meta/dataset/csv/?query=' + encodeURIComponent(JSON.stringify(card.dataset_query));
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
                editorModel.isRunning = true;
                renderAll();

                // make our api call
                Metabase.dataset(dataset_query, function (result) {
                    visualizationModel.result = result;
                    editorModel.isRunning = false;
                    renderAll();

                }, function (error) {
                    console.log('error running query', error);
                });
            },
            notifyQueryModifiedFn: function(dataset_query) {
                // we are being told that the query has been modified
                headerModel.card.dataset_query = dataset_query;
                renderAll();
            }
        };

        var visualizationModel = {
            card: null,
            result: null,
            setDisplayFn: function(type) {
                // change the card visualization type and refresh chart settings
                headerModel.card.display = type;
                headerModel.card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, type);
                // TODO: ideally this wouldn't be necessary
                //       to fix this we'd need the component to not need the card
                renderVisualization();
            }
        };


        // =====  REACT render functions

        var renderHeader = function() {
            React.render(new QueryHeader(headerModel), document.getElementById('react_qb_header'));
        };

        var renderEditor = function() {
            // make sure we are using the latest query definition
            editorModel.query = headerModel.card.dataset_query;

            if (headerModel.card.dataset_query && headerModel.card.dataset_query.type === 'native') {
                React.render(new NativeQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            } else {
                React.render(new GuiQueryEditor(editorModel), document.getElementById('react_qb_editor'));
            }
        }

        var renderVisualization = function() {
            // make sure our card is up to date
            visualizationModel.card = headerModel.card;

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
                console.log('card', result);

                if (cloning) {
                    result.id = undefined; // since it's a new card
                    result.organization = $scope.currentOrg.id;
                    result.carddirty = true; // so it cand be saved right away
                }

                // add a custom function for tracking dirtyness
                result.isDirty = cardIsDirty;

                // update our react models as needed
                headerModel.card = result;
                editorModel.initialQuery = headerModel.card.dataset_query;

                // run the query
                // TODO: is there a case where we wouldn't want this?
                editorModel.runFn(editorModel.initialQuery);

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
                    $scope.card = {
                        'organization': $scope.currentOrg.id,
                        'name': query.name,
                        'public_perms': 0,
                        'can_read': true,
                        'can_write': true,
                        'display': 'table', //table display type is currently always available (and should always be displayable) for SQL-backed queries, per updateAvailableDisplayTypes
                        'dataset_query': {
                            'database': query.database.id,
                            'type': 'result',
                            'result': {
                                'query_id': query.id
                            }
                        }
                    };

                    // now get the data for the card
                    $scope.execute($scope.card);

                    // in this particular case we are already dirty and ready for save
                    $scope.carddirty = true;

                }, function (error) {
                    console.log(error);
                    if (error.status == 404) {
                        $location.path('/');
                    }
                });

            } else {
                // starting a new card, so simply trigger full rendering
                renderAll();
            }
        };

        // TODO: we should get database list first, then do rest of setup
        //       because without databases this UI is meaningless
        $scope.$watch('currentOrg', function (org) {
            // we need org always, so we just won't do anything if we don't have one
            if (!org) {return};

            // TODO: while we wait for the databases list we should put something on screen

            // grab our database list, then handle the rest
            Metabase.db_list({
                'orgId': org.id
            }, function (dbs) {
                editorModel.databases = dbs;

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