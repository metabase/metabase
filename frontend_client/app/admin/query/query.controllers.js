'use strict';
/*global _*/


var QueryControllers = angular.module('corvusadmin.query.controllers', [
    'corvus.metabase.services',
    'corvusadmin.queryservice.services',
    'corvusadmin.query.services'
]);

QueryControllers.controller('QueryList', ['$scope', '$location', 'Query', function($scope, $location, Query) {
    var sort;
    $scope.filterMode = 'all';
    $scope.sortMode = 'name';

    $scope.deleteQuery = function(queryId) {
        Query.delete({
            'queryId': queryId
        }, function(result) {
            // this code just purges that query from our list
            $scope.queries = _.filter($scope.queries, function(query) {
                return query.id != queryId;
            });
            $scope.searchFilter = undefined;
        });
    };

    $scope.inlineSave = function(query, idx) {
        Query.update(query, function(result) {
            if (result && !result.error) {
                $scope.queries[idx] = result;
            } else {
                return "error";
            }
        });
    };

    $scope.filter = function(mode) {
        $scope.filterMode = mode;

        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            Query.list({
                'orgId': org.id,
                'filterMode': mode
            }, function(result) {
                $scope.queries = result;

                $scope.sort();
            });
        });
    };

    $scope.sort = function() {
        if ('date' == $scope.sortMode) {
            $scope.queries.sort(function(a, b) {
                a = new Date(a.updated_at);
                b = new Date(b.updated_at);
                return a > b ? -1 : a < b ? 1 : 0;
            });
        } else if ('db' == $scope.sortMode) {
            $scope.queries.sort(function(a, b) {
                return a.database.name.localeCompare(b.database.name);
            });
        } else if ('owner' == $scope.sortMode) {
            $scope.queries.sort(function(a, b) {
                return a.creator.email.localeCompare(b.creator.email);
            });
        } else {
            // default mode is by query name
            $scope.queries.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
        }
    };

    $scope.filter('all');
}]);

QueryControllers.controller('QueryRun', ['$scope', '$location', '$interval', 'Metabase', 'QueryService', 'Query', function($scope, $location, $interval, Metabase, QueryService, Query) {

    // $scope.query: model object for form input
    // $scope.queryResultData: response data from adhoc query execution
    var queryMonitor; // promise object from a running $interval which is polling a given query
    var queryMonitorCount; // counter for number of times the running query has executed our interval
    var aceEditor;

    $scope.query = {};

    $scope.$on('$destroy', function() {
        // Make sure that the interval is destroyed
        $scope.cancelQueryMonitor();
    });

    $scope.onEditorloaded = function(editor) {
        aceEditor = editor;
    };

    $scope.runAdhocQuery = function(query) {
        // if we already have a queryMonitor then cancel it.
        // TODO: should we even allow the user to run another query if a previous one is executing??
        $scope.cancelQueryMonitor();

        // run the new query
        QueryService.run(query, function(result) {
            $scope.queryResultData = result;

            // if the query is still running then lets start a queryMonitor running at intervals
            if (result.status === "running" || result.status == "new" || result.status == "starting") {

                queryMonitorCount = 1;

                queryMonitor = $interval(function() {
                    // poll for updates in a gradually decreasing frequency
                    // every 1 second for first 5 seconds
                    // every 2 seconds for next 20 seconds
                    // every 5 seconds for the remainder of time
                    var modulo = 1;
                    if (queryMonitorCount > 20) {
                        modulo = 5;
                    } else if (queryMonitorCount > 5) {
                        modulo = 2;
                    }

                    if (queryMonitorCount % modulo === 0) {
                        // simply ask the api for the updated result on the query
                        QueryService.get({
                            'queryId': $scope.queryResultData.uuid
                        }, function(result) {
                            if (result) {
                                $scope.queryResultData = result;

                                if (result.status == "completed" || result.status == "failed") {
                                    $scope.cancelQueryMonitor();
                                }

                            }
                        });
                    }

                    queryMonitorCount++;

                }, 1000);
            }
        });

        // ensure that editor is refocused
        aceEditor.focus();
    };

    $scope.saveAdhocQuery = function(query) {
        Query.create(query, function(newQuery) {
            if (newQuery && !newQuery.error) {
                // immediately trigger an execution of a new Query so that users can quickly
                // create a Card from the Query without waiting for normal Query exec cycle.
                Query.execute({
                    'queryId': newQuery.id
                }, function(result) {
                    // now we can just move on to our redirect
                    // TODO: right now this is happening synchronously, which is not ideal
                    $location.path('/' + $scope.currentOrg.slug + '/admin/query/' + newQuery.id);
                });
            }
        }, function(error) {
            console.log('error creating query', error);
        });
    };

    $scope.cancelQueryMonitor = function() {
        if (angular.isDefined(queryMonitor)) {
            $interval.cancel(queryMonitor);
            queryMonitor = undefined;
            queryMonitorCount = undefined;
        }
    };

    $scope.$watch('currentOrg', function(org) {
        if (!org) return;

        Query.form_input({
            'orgId': org.id
        }, function(form_input) {
            $scope.form_input = form_input;

            // if there is only a single database then just select it now
            if (form_input.databases.length == 1) {
                $scope.query.database = form_input.databases[0].id;
            }
        }, function(error) {
            console.log('error getting query form_input', error);
        });
    });

}]);

QueryControllers.controller('QueryView', ['$scope', '$routeParams', '$location', '$interval', 'Query', 'QueryResult', function($scope, $routeParams, $location, $interval, Query, QueryResult) {

    var queryMonitor; // promise object from a running $interval which is polling a given query
    var queryMonitorCount; // counter for number of times the running query has executed our interval
    var aceEditor;

    $scope.$on('$destroy', function() {
        // Make sure that the interval is destroyed
        $scope.cancelQueryMonitor();
    });

    $scope.onEditorLoaded = function(editor) {
        aceEditor = editor;
    };

    $scope.cancelQueryMonitor = function() {
        if (angular.isDefined(queryMonitor)) {
            $interval.cancel(queryMonitor);
            queryMonitor = undefined;
            queryMonitorCount = undefined;
        }
    };

    $scope.cloneQuery = function(queryId) {
        Query.create({
            'clone': queryId
        }, function(result) {
            if (result && !result.error) {
                $location.path('/' + $scope.currentOrg.slug + '/admin/query/' + result.id + '/modify');
            }
        });
    };

    $scope.runQuery = function(queryId) {
        // if we already have a queryMonitor then cancel it.
        // TODO: should we even allow the user to run another query if a previous one is executing??
        $scope.cancelQueryMonitor();

        // clear the results from the view while we work on executing
        $scope.refreshResultData(null);

        Query.execute({
            'queryId': queryId
        }, function(result) {

            // put our new result at the FRONT of our queries list
            $scope.queryRecentExecutions.unshift(result);

            $scope.queryResult = result;
            $scope.refreshResultData(result.id);

            // if the query is still running then lets start a queryMonitor running at intervals
            if (result.status === "running" || result.status == "new" || result.status == "starting") {

                queryMonitorCount = 1;
                queryMonitor = $interval(function() {
                    // poll for updates in a gradually decreasing frequency
                    // every 1 second for first 5 seconds
                    // every 2 seconds for next 20 seconds
                    // every 5 seconds for the remainder of time
                    var modulo = 1;
                    if (queryMonitorCount > 20) {
                        modulo = 5;
                    } else if (queryMonitorCount > 5) {
                        modulo = 2;
                    }

                    if (queryMonitorCount % modulo === 0) {
                        // simply ask the api for the updated result on the query
                        QueryResult.get({
                            'resultId': result.id
                        }, function(result) {
                            if (result) {
                                $scope.refreshResultData(result.id);

                                if (result.status == "completed" || result.status == "failed") {
                                    // we are done polling for updated status now :)
                                    $scope.cancelQueryMonitor();

                                    // make sure the recent executions listing has the final state indicated
                                    for (var i = 0; i < $scope.queryRecentExecutions.length; i++) {
                                        if (result.id == $scope.queryRecentExecutions[i].id) {
                                            $scope.queryRecentExecutions[i] = result;
                                        }
                                    }
                                }

                            }
                        });
                    }

                    queryMonitorCount++;

                }, 1000);
            }
        });
    };

    $scope.saveAndExecute = function(query) {
        // add structured queries
        if (query.type == 'rawsql') {
            query.sql = $scope.query.details.sql;
            query.timezone = $scope.query.details.timezone;
        } else if (query.type == 'query') {
            query.details = $scope.query_details;
        }
        Query.update(query, function(result) {
            if (result && !result.error) {
                $scope.setQuery(result);
                // now trigger the execution
                $scope.runQuery(result.id);
            }
        });

        // ensure editor is still in focus
        aceEditor.focus();
    };

    $scope.save = function(query) {
        if (query.type == 'rawsql') {
            query.sql = $scope.query.details.sql;
        } else if (query.type == 'query') {
            query.details = $scope.query_details;
        }

        Query.update(query, function(result) {
            if (result && !result.error) {
                $scope.setQuery(result);
            }
        });
    };

    $scope.inlineSave = function(query) {
        // NOTE: this is different from save() in this case because we do NOT inject the 'sql' attribute
        Query.update(query, function(result) {
            if (result && !result.error) {
                $scope.setQuery(result);
            } else {
                return "error";
            }
        });
    };

    $scope.refreshResultData = function(resultId) {
        // takes in a QueryResult id and pulls the response data associated with it

        // clear out previous results first
        $scope.queryResultData = {};

        if (resultId) {
            // fetch new results data
            QueryResult.response({
                'resultId': resultId
            }, function(result) {
                if (result) {
                    $scope.queryResultData = result;
                }
            });
        }
    };

    $scope.setQuery = function(result) {
        $scope.query = result;
    };

    // $scope.query: single Query being displayed
    // $scope.queryResult: single QueryResult being displayed
    // $scope.queryResultData: response data from single QueryResult being displayed
    // $scope.queryRecentExecutions: list of recent executions from query being displayed
    // $scope.error: any relevant error message to be displayed

    $scope.$watch('currentOrg', function(org) {
        if (!org) return;

        Query.form_input({
            'orgId': org.id
        }, function(form_input) {
            $scope.form_input = form_input;
        }, function(error) {
            console.log('error getting query form_input', error);
        });
    });


    if ($routeParams.queryId) {
        // fetch the Query data
        Query.get({
            'queryId': $routeParams.queryId
        }, function(result) {
            $scope.setQuery(result);
        }, function(error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
            }
        });

        // fetch the recent results for the Query
        Query.results({
            'queryId': $routeParams.queryId
        }, function(result) {
            $scope.queryRecentExecutions = result;

            // fetch specific result data for one execution
            if ($routeParams.resultId) {
                // we are just going to iterate through recent executions and the find the one asked for
                for (var i = 0; i < result.length; i++) {
                    if (result[i].id == $routeParams.resultId) {
                        $scope.queryResult = result[i];
                        break;
                    }
                }

                // TODO: in order to support a scenario where a user can access a query result older than 'recent'
                //       we would need to put in some code to pull the specific result data right here
                if ($scope.queryResult === null) {
                    QueryResult.get({
                        'resultId': $routeParams.resultId
                    }, function(result) {
                        $scope.queryResult = result;
                    });
                }

                $scope.refreshResultData($routeParams.resultId);
            } else if (result[0]) {
                $scope.queryResult = result[0];
                $scope.refreshResultData(result[0].id);
            }
        });
    }
}]);