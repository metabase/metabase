'use strict';

var OperatorControllers = angular.module('corvus.operator.controllers', []);

OperatorControllers.controller('SpecialistList', ['$scope', 'Metabase', 'Operator',
    function($scope, Metabase, Operator) {
        // set initial defaults for sorting
        $scope.orderByField = "nick";
        $scope.reverseSort = false;

        $scope.$watch('currentOrg', function (org) {
            if (!org) return;

            Operator.queryInfo(org.id).then(function(queryInfo){

                // TODO: we need offset support in dataset_query if we want to do paging

                // TODO: ideally we can search by (name, id, store)
                $scope.search = function () {
                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'source_table': queryInfo.specialist_table,
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter':[null, null],
                            'limit': null
                        }
                    }, function (queryResponse) {
                        // TODO: we should check that the query succeeded
                        $scope.specialists = Operator.convertToObjects(queryResponse.data);

                    }, function (error) {
                        console.log(error);
                    });
                };

                $scope.search();

                //run saved SQL queries for overview metrics in right pane
                Metabase.dataset({
                    'database': queryInfo.database,
                    'type': 'result',
                    'result':{
                        query_id: queryInfo.specialist_overview_avg_rating_query
                    }
                }, function(queryResponse){
                    $scope.overviewAvgRating = queryResponse.data.rows[0][0];
                }, function(error){
                    console.log("error:");
                    console.log(error);
                });

                Metabase.dataset({
                    'database': queryInfo.database,
                    'type': 'result',
                    'result': {
                        query_id: queryInfo.specialist_overview_avg_response_time_query
                    }
                }, function(queryResponse){
                    $scope.overviewAvgResponseTimeSecs = queryResponse.data.rows[0][0];
                }, function(error){
                    console.log("error:");
                    console.log(error);
                });

            }, function(reason){
                console.log("failed to get queryInfo:");
                console.log(reason);
            });

        });

    }
]);


OperatorControllers.controller('SpecialistDetail', ['$scope', '$routeParams', 'Metabase', 'Operator',
    function($scope, $routeParams, Metabase, Operator) {
        // set the default ordering to the last message sent, as the field team is generally concerned with
        // recent messages
        $scope.orderByField = "time_newmessage_server";
        // set reverse to true so we see the most recent messages first
        $scope.reverseSort = true;

        $scope.$watch('currentOrg', function (org) {
            if (!org) return;

            Operator.queryInfo(org.id).then(function(queryInfo){
                if ($routeParams.specialistId) {
                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'source_table': queryInfo.specialist_table,
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter':['=', queryInfo.specialist_id_field, parseInt($routeParams.specialistId, 10)],
                            'limit': null
                        }
                    }, function (queryResponse) {
                        $scope.specialist = Operator.convertToObjects(queryResponse.data)[0];

                        // grab conversations
                        Metabase.dataset({
                            'database': queryInfo.database,
                            'type': 'query',
                            'query': {
                                'source_table': queryInfo.conversations_table,
                                'aggregation': ['rows'],
                                'breakout': [null],
                                'filter':['=', queryInfo.conversations_specialist_fk, parseInt($routeParams.specialistId, 10)],
                                'limit': null
                            }
                        }, function (response) {
                            $scope.conversations = Operator.convertToObjects(response.data);

                        }, function (error) {
                            console.log(error);
                        });

                    }, function (error) {
                        console.log(error);
                    });
                }
            }, function(reason){
                console.log("failed to get queryInfo:");
                console.log(reason);
            });
        });
    }
]);


OperatorControllers.controller('ConversationDetail', ['$scope', '$routeParams', 'Metabase', 'Operator',
    function($scope, $routeParams, Metabase, Operator) {

        $scope.toObject = function(str) {
            //var unescaped = str.replace(/\\"/g, '"');
            return angular.fromJson(str);
        };

        $scope.$watch('currentOrg', function (org) {
            if (!org) return;

            Operator.queryInfo(org.id).then(function(queryInfo){
                if ($routeParams.conversationId) {
                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'source_table': queryInfo.conversations_table,
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter':['=', queryInfo.conversations_id_field, $routeParams.conversationId],
                            'limit': null
                        }
                    }, function (queryResponse) {
                        $scope.conversation = Operator.convertToObjects(queryResponse.data)[0];

                        // grab messages
                        // TODO: ensure ordering by message timestamp
                        Metabase.dataset({
                            'database': queryInfo.database,
                            'type': 'query',
                            'query': {
                                'source_table': queryInfo.messages_table,
                                'aggregation': ['rows'],
                                'breakout': [null],
                                'filter':['=', queryInfo.messages_table_conversation_fk, $routeParams.conversationId],
                                'limit': null
                            }
                        }, function (response) {
                            $scope.messages = Operator.convertToObjects(response.data);

                            // sort them by timestamp
                            $scope.messages.sort(function compare (a, b) {
                                if (a.time_updated_server < b.time_updated_server)
                                    return -1;
                                if (a.time_updated_server > b.time_updated_server)
                                    return 1;
                                return 0;
                            });

                        }, function (error) {
                            console.log(error);
                        });

                    }, function (error) {
                        console.log(error);
                    });
                }
            }, function(reason){
                console.log("failed to get queryInfo:");
                console.log(reason);
            });
        });
    }
]);
