
import Routes from "./Routes.jsx";

import { createStore, combineReducers } from "metabase/lib/redux";

import { routerStateReducer as router } from 'redux-router';
import { reducer as form } from "redux-form";

import * as datamodel from 'metabase/admin/datamodel/reducers';

import { registerAnalyticsClickListener } from "metabase/lib/analytics";

// Declare app level module which depends on filters, and services
var Metabase = angular.module('metabase', [
    'ngRoute',
    'ngCookies',
    'metabase.auth',
    'metabase.filters',
    'metabase.directives',
    'metabase.controllers',
    'metabase.components',
    'metabase.card',
    'metabase.dashboard',
    'metabase.home',
    'metabase.pulse',
    'metabase.setup',
    'metabase.user',
    'metabase.admin.databases',
    'metabase.admin.people',
    'metabase.admin.settings',
    'metabase.admin.datamodel',
]);
Metabase.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    const route = {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams', 'AppState',
            function($scope, $location, $route, $routeParams, AppState) {
                $scope.Component = Routes;
                $scope.props = {};
                $scope.store = createStore(combineReducers({
                    // admin: {
                    //     datamodel
                    // },
                    datamodel: combineReducers(datamodel),
                    form,
                    router,
                    user: (state = null) => state
                }), { user: AppState.model.currentUser });

                // HACK: prevent reloading controllers as the URL changes
                var route = $route.current;
                $scope.$on('$locationChangeSuccess', function (event) {
                    var newParams = $route.current.params;
                    var oldParams = route.params;

                    if ($route.current.$$route.controller === route.controller) {
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
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    };

    $routeProvider.when('/admin/datamodel/metric', route);
    $routeProvider.when('/admin/datamodel/metric/:segmentId', route);

    $routeProvider.when('/admin/datamodel/segment', route);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', route);

    $routeProvider.when('/admin/datamodel/:objectType/:objectId/revisions', route);

    $routeProvider.when('/unauthorized/', {
        templateUrl: '/app/unauthorized.html',
        controller: 'Unauthorized'
    });

    $routeProvider.when('/auth/', {
        redirectTo: function(routeParams, path, search) {
            return '/auth/login';
        }
    });

    $routeProvider.when('/admin/', {
        redirectTo: function(routeParams, path, search) {
            return '/admin/settings';
        }
    });

    // TODO: we need an appropriate homepage or something to show in this situation
    $routeProvider.otherwise({
        templateUrl: '/app/not_found.html',
        controller: 'NotFound'
    });
}]);

Metabase.run(["AppState", function(AppState) {
    // initialize app state
    AppState.init();

    // start our analytics click listener
    registerAnalyticsClickListener();
}]);
