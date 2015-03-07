'use strict';

var ReserveControllers = angular.module('corvus.reserve.controllers', []);

ReserveControllers.controller('VenueList', ['$scope', 'Metabase', 'Reserve',
    function($scope, Metabase, Reserve){
        $scope.orderByField = "name";
        $scope.reverseSort = false;

        $scope.$watch('currentOrg', function(org){
            if(!org) return;

            Reserve.queryInfo(org.id).then(function(queryInfo){
                $scope.search = function(){
                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'source_table': queryInfo.venue_table,
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter': [null, null],
                            'limit': null
                        }
                    }, function(queryResponse){
                        $scope.venues = Reserve.convertToObjects(queryResponse.data);
                    }, function(error){
                        console.log(error);
                    });
                };

                $scope.search();
            });
        });
    }
]);

ReserveControllers.controller('VenueDetail', ['$scope', '$routeParams', 'Metabase', 'Reserve',
    function($scope, $routeParams, Metabase, Reserve) {
        $scope.orderByField = "user";
        $scope.reverseSort = false;

        $scope.$watch('currentOrg', function(org){
            if(!org) return;
            Reserve.queryInfo(org.id).then(function(queryInfo){
                Metabase.dataset({
                    'database': queryInfo.database,
                    'type': 'query',
                    'query': {
                        'source_table': queryInfo.venue_table,
                        'aggregation': ['rows'],
                        'breakout': [null],
                        'filter': ['=', queryInfo.venue_id_field, $routeParams.venueId]
                    }
                }, function(venueResponse){
                    $scope.venue = Reserve.convertToObjects(venueResponse.data)[0];
                    var dataset_query = {
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'fields':[
                                queryInfo.user_firstName_field,
                                queryInfo.user_lastName_field,
                                queryInfo.user_id_field,
                                queryInfo.booking_guests_field,
                                queryInfo.booking_overage_field,
                                queryInfo.booking_rating_field,
                                queryInfo.booking_createdAt_field,
                                queryInfo.booking_updatedAt_field
                            ],
                            'from':[{
                                'table': queryInfo.user_table
                            }, {
                                'table': queryInfo.booking_table,
                                'join_type': 'inner',
                                'conditions':[
                                    {
                                        'src_field': queryInfo.user_id_field,
                                        'dest_field': queryInfo.booking_user_fk
                                    }
                                ]
                            }],
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter': ['=', queryInfo.booking_venue_fk, $routeParams.venueId]
                        }
                    };

                    Metabase.dataset(dataset_query,
                    function(bookingsResponse){
                        $scope.bookings = Reserve.convertToObjects(bookingsResponse.data);
                    }, function(error){
                        console.log(error);
                    });

                }, function(error){
                    console.log(error);
                });
            });
        });
    }
]);


ReserveControllers.controller('UserList', ['$scope', 'Metabase', 'Reserve',
    function($scope, Metabase, Reserve){
        $scope.orderByField = "firstName";
        $scope.reverseSort = false;

        $scope.$watch('currentOrg', function(org){
            if(!org) return;

            Reserve.queryInfo(org.id).then(function(queryInfo){
                $scope.search = function(){
                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'source_table': queryInfo.user_table,
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter': [null, null],
                            'limit': null
                        }
                    }, function(queryResponse){
                        $scope.users = Reserve.convertToObjects(queryResponse.data);
                    }, function(error){
                        console.log(error);
                    });
                };

                $scope.search();
            });
        });

    }
]);


ReserveControllers.controller('UserDetail', ['$scope', '$routeParams', 'Metabase', 'Reserve',
    function($scope, $routeParams, Metabase, Reserve) {
        $scope.orderByField = "user";
        $scope.reverseSort = false;

        $scope.$watch('currentOrg', function(org){
            if(!org) return;
            Reserve.queryInfo(org.id).then(function(queryInfo){
                Metabase.dataset({
                    'database': queryInfo.database,
                    'type': 'query',
                    'query': {
                        'source_table': queryInfo.user_table,
                        'aggregation': ['rows'],
                        'breakout': [null],
                        'filter': ['=', queryInfo.user_id_field, $routeParams.userId]
                    }
                }, function(userResponse){
                    $scope.user = Reserve.convertToObjects(userResponse.data)[0];

                    Metabase.dataset({
                        'database': queryInfo.database,
                        'type': 'query',
                        'query': {
                            'fields':[
                                queryInfo.venue_name_field,
                                queryInfo.venue_id_field,
                                queryInfo.booking_guests_field,
                                queryInfo.booking_overage_field,
                                queryInfo.booking_rating_field,
                                queryInfo.booking_createdAt_field,
                                queryInfo.booking_updatedAt_field
                            ],
                            'from':[{
                                'table': queryInfo.venue_table
                            }, {
                                'table': queryInfo.booking_table,
                                'join_type': 'inner',
                                'conditions':[
                                    {
                                        'src_field': queryInfo.venue_id_field,
                                        'dest_field': queryInfo.booking_venue_fk
                                    }
                                ]
                            }],
                            'aggregation': ['rows'],
                            'breakout': [null],
                            'filter': ['=', queryInfo.booking_user_fk, $routeParams.userId]
                        }
                    }, function(bookingsResponse){
                        $scope.bookings = Reserve.convertToObjects(bookingsResponse.data);
                    }, function(error){
                        console.log(error);
                    });

                }, function(error){
                    console.log(error);
                });
            });
        });
    }
]);
