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
        var MAX_DIMENSIONS = 2;

        var queryBuilder;

        var createQueryBuilderModel = function (org) {
            return {
                org: org,
                getDatabaseList: function() {
                    Metabase.db_list({
                        'orgId': org.id
                    }, function(dbs) {
                        queryBuilder.database_list = dbs;
                        // set the database to the first db, the user will be able to change it
                        // TODO be smarter about this and use the most recent or popular db
                        queryBuilder.setDatabase(dbs[0].id);
                    }, function(error) {
                        console.log('error getting database list', error);
                    });
                },
                setDatabase: function(databaseId) {
                    // check if this is the same db or not
                    if (databaseId != queryBuilder.card.dataset_query.database) {
                        queryBuilder.resetQuery();
                        queryBuilder.card.dataset_query.database = databaseId;
                        queryBuilder.getTables(databaseId);
                        queryBuilder.inform();
                    } else {
                        return false;
                    }
                },
                resetQuery: function() {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query = {
                        type: "query",
                        query: {
                            aggregation: [null],
                            breakout: [],
                            filter: []
                        }
                    };
                },
                setPermissions: function(permission) {
                    queryBuilder.card.public_perms = permission;
                    queryBuilder.inform();
                },
                getTableFields: function(tableId) {
                    Metabase.table_query_metadata({
                        'tableId': tableId
                    }, function(result) {
                        console.log('result', result);
                        // Decorate with valid operators
                        var table = CorvusFormGenerator.addValidOperatorsToFields(result);
                        table = QueryUtils.populateQueryOptions(table);
                        queryBuilder.selected_table_fields = table;

                        // TODO: 'native' query support
                        if (queryBuilder.card.dataset_query.query.aggregation.length > 1) {
                            queryBuilder.getAggregationFields(queryBuilder.card.dataset_query.query.aggregation[0]);
                        } else {
                            queryBuilder.inform();
                        }
                    });
                },
                getTables: function(databaseId) {
                    Metabase.db_tables({
                        'dbId': databaseId
                    }, function(tables) {
                        queryBuilder.table_list = tables;
                        queryBuilder.inform();
                        // TODO(@kdoh) what are we actually doing with this?
                    }, function(error) {
                        console.log('error getting tables', error);
                    });
                },
                canAddDimensions: function() {
                    // TODO: 'native' query support
                    var canAdd = queryBuilder.card.dataset_query.query.breakout.length < MAX_DIMENSIONS ? true : false;
                    return canAdd;
                },
                // a simple funciton to call when updating parts of the query. this allows us to know whether the query is 'dirty' and triggers
                // a re-render of the react ui
                inform: function() {
                    queryBuilder.hasChanged = true;
                    React.render(new QueryBuilder({
                        model: queryBuilder
                    }), document.getElementById('react'));
                },
                extractQuery: function(card) {
                    queryBuilder.card = card;
                    queryBuilder.getTables(card.dataset_query.database);
                    // TODO: 'native' query support
                    queryBuilder.setSourceTable(card.dataset_query.query.source_table);
                },
                getAggregationFields: function(aggregation) {
                    // @aggregation: id
                    // todo - this could be a war crime
                    // TODO: 'native' query support
                    _.map(queryBuilder.selected_table_fields.aggregation_options, function(option) {
                        if (option.short === aggregation) {
                            if (option.fields.length > 0) {
                                if (queryBuilder.card.dataset_query.query.aggregation.length == 1) {
                                    queryBuilder.card.dataset_query.query.aggregation[1] = null;
                                }
                                queryBuilder.aggregation_field_list = option.fields;
                                queryBuilder.inform();
                            } else {
                                queryBuilder.card.dataset_query.query.aggregation.splice(1, 1);
                                queryBuilder.inform();
                            }
                        }
                    });
                },
                setSourceTable: function(sourceTable) {
                    // this will either be the id or an object with an id
                    var tableId = sourceTable.id || sourceTable;
                    Metabase.table_get({
                            tableId: tableId
                        },
                        function(result) {
                            // TODO: 'native' query support
                            queryBuilder.card.dataset_query.query.source_table = result.id;
                            queryBuilder.getTableFields(result.id);
                            queryBuilder.inform();
                        },
                        function(error) {
                            console.log('error', error);
                        });
                },

                aggregationComplete: function() {
                    var aggregationComplete;
                    // TODO: 'native' query support
                    if ((queryBuilder.card.dataset_query.query.aggregation[0] !== null) && (queryBuilder.card.dataset_query.query.aggregation[1] !== null)) {
                        aggregationComplete = true;
                    } else {
                        aggregationComplete = false;
                    }
                    return aggregationComplete;
                },
                addDimension: function() {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query.query.breakout.push(null);
                    queryBuilder.inform();
                },
                removeDimension: function(index) {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query.query.breakout.splice(index, 1);
                    queryBuilder.inform();
                },
                updateDimension: function(dimension, index) {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query.query.breakout[index] = dimension;
                    queryBuilder.inform();
                },
                setAggregation: function(aggregation) {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query.query.aggregation[0] = aggregation;

                    // go grab the aggregations
                    queryBuilder.getAggregationFields(aggregation);
                },
                setAggregationTarget: function(target) {
                    // TODO: 'native' query support
                    queryBuilder.card.dataset_query.query.aggregation[1] = target;
                    queryBuilder.inform();
                },
                updateFilter: function(value, index, filterListIndex) {
                    // TODO: 'native' query support
                    var filters = queryBuilder.card.dataset_query.query.filter;
                    if (filterListIndex) {
                        filters[filterListIndex][index] = value;
                    } else {
                        filters[index] = value;
                    }

                    queryBuilder.inform();
                },
                removeFilter: function(index) {
                    // TODO: 'native' query support
                    var filters = queryBuilder.card.dataset_query.query.filter;

                    /*
                        HERE BE MORE DRAGONS

                        1.) if there are 3 values and the first isn't AND, this means we only ever had one "filter", so reset to []
                        instead of slicing off individual elements

                        2.) if the first value is AND and there are only two values in the array, then we're about to remove the last filter after
                        having added multiple so we should reset to [] in this case as well
                    */

                    if ((filters.length === 3 && filters[0] !== 'AND') || (filters[0] === 'AND' && filters.length === 2)) {
                        // just reset the array
                        queryBuilder.card.dataset_query.query.filter = [];
                    } else {
                        queryBuilder.card.dataset_query.query.filter.splice(index, 1);
                    }
                    queryBuilder.inform();
                },
                addFilter: function() {
                    // TODO: 'native' query support
                    var filter = queryBuilder.card.dataset_query.query.filter,
                        filterLength = filter.length;

                    // this gets run the second time you click the add filter button
                    if (filterLength === 3 && filter[0] !== 'AND') {
                        var newFilters = [];
                        newFilters.push(filter);
                        newFilters.unshift('AND');
                        newFilters.push([null, null, null]);
                        queryBuilder.card.dataset_query.query.filter = newFilters;
                        queryBuilder.inform();
                    } else if (filter[0] === 'AND') {
                        pushFilterTemplate(filterLength);
                        queryBuilder.inform();
                    } else {
                        pushFilterTemplate();
                        queryBuilder.inform();
                    }

                    function pushFilterTemplate(index) {
                        if (index) {
                            filter[index] = [null, null, null];
                        } else {
                            filter.push(null, null, null);
                        }
                    }
                },
                save: function(settings) {
                    var card = queryBuilder.card;
                    card.name = settings.name;
                    card.description = settings.description;
                    card.organization = queryBuilder.org.id;
                    card.display = "table"; // TODO, be smart about this

                    if ($routeParams.cardId) {
                        Card.update(card, function(updatedCard) {
                            queryBuilder.inform();
                        });
                    } else {
                        Card.create(card, function(newCard) {
                            $location.path('/' + org.slug + '/card/' + newCard.id);
                        }, function(error) {
                            console.log('error creating card', error);
                        });

                    }
                },
                getDownloadLink: function() {
                    // TODO: this should be conditional and only return a valid url if we have valid
                    //       data to be downloaded.  otherwise return something falsey
                    if (queryBuilder.result) {
                        return '/api/meta/dataset/csv/?query=' + encodeURIComponent(JSON.stringify(queryBuilder.card.dataset_query));
                    }
                },
                cleanFilters: function(dataset_query) {
                    // TODO: 'native' query support
                    var filters = dataset_query.query.filter,
                        cleanFilters = [];
                    // in instances where there's only one filter, the api expects just one array with the values
                    if (typeof(filters[0]) == 'object' && filters[0] != 'AND') {
                        for (var filter in filters[0]) {
                            cleanFilters.push(filters[0][filter]);
                        }
                        dataset_query.query.filter = cleanFilters;
                    }
                    // reset to initial state of filters if we've removed 'em all
                    if (filters.length === 1 && filters[0] === 'AND') {
                        dataset_query.filter = [];
                    }
                    return dataset_query;
                },
                canRun: function() {
                    var canRun = false;
                    if (queryBuilder.aggregationComplete()) {
                        canRun = true;
                    }
                    return canRun;
                },
                run: function() {
                    var query = queryBuilder.cleanFilters(queryBuilder.card.dataset_query);
                    console.log(query);
                    queryBuilder.isRunning = true;
                    queryBuilder.inform();

                    Metabase.dataset(query, function(result) {
                        console.log('result', result);
                        queryBuilder.result = result;
                        queryBuilder.isRunning = false;
                        // we've not changed yet since we just ran
                        queryBuilder.hasRun = true;
                        queryBuilder.hasChanged = false;
                        queryBuilder.inform();
                    }, function(error) {
                        console.log('could not run card!', error);
                    });
                },
                setDisplay: function(type) {
                    // change the card visualization type and refresh chart settings
                    queryBuilder.card.display = type;
                    queryBuilder.card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, type);
                    queryBuilder.inform();
                },
            };
        };

        var isDirty = function() {
            return false;
        };

        $scope.$watch('currentOrg', function (org) {
            // we need org always, so we just won't do anything if we don't have one
            if (!org) {return};

            queryBuilder = createQueryBuilderModel(org);

            if ($routeParams.cardId) {
                // loading up an existing card
                Card.get({
                    'cardId': $routeParams.cardId
                }, function(result) {
                    result.isDirty = isDirty;
                    console.log('result', result);
                    queryBuilder.extractQuery(result);
                    queryBuilder.getDatabaseList();
                    // run the query
                    queryBuilder.run();
                    // execute the query
                }, function(error) {
                    if (error.status == 404) {
                        // TODO() - we should redirect to the card builder with no query instead of /
                        $location.path('/');
                    }
                });

            } else if ($routeParams.clone) {
                // fetch the existing Card so we can set $scope.card with the existing values
                Card.get({
                    'cardId': $routeParams.clone
                }, function(result) {
                    $scope.setCard(result);

                    // execute the Card so it can be saved right away
                    $scope.execute(result);

                    // replace values in $scope.card as needed
                    $scope.card.id = undefined; // since it's a new card
                    $scope.card.organization = $scope.currentOrg.id;
                    $scope.carddirty = true; // so it cand be saved right away
                }, function(error) {
                    console.log(error);
                    if (error.status == 404) {
                        $location.path('/');
                    }
                });

            } else if ($routeParams.queryId) {
                // @legacy ----------------------
                // someone looking to create a card from a query
                Query.get({
                    'queryId': $routeParams.queryId
                }, function(query) {
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

                }, function(error) {
                    console.log(error);
                    if (error.status == 404) {
                        $location.path('/');
                    }
                });

            } else {
                queryBuilder.getDatabaseList();
                queryBuilder.card = {
                    name: null,
                    public_perms: 0,
                    can_read: true,
                    can_write: true,
                    display: 'none',
                    dataset_query: {
                        type: "query",
                        query: {
                            aggregation: [null],
                            breakout: [],
                            filter: []
                        }
                    },
                    isDirty: isDirty
                };
            }
        }); // end watch
    }
]);