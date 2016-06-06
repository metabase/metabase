import { createStore, combineReducers } from "metabase/lib/redux";

import PulseListApp from './containers/PulseListApp.jsx';
import PulseEditApp from './containers/PulseEditApp.jsx';

import * as reducers from './reducers';

const reducer = combineReducers(reducers);

var Pulse = angular.module('metabase.pulse', []);

Pulse.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/pulse/', {
        template: '<div mb-redux-component />',
        controller: ['$scope', '$location', '$route', '$routeParams', 'AppState',
            function($scope, $location, $route, $routeParams, AppState) {
                $scope.Component = PulseListApp;
                $scope.props = {
                    user: AppState.model.currentUser,
                    pulseId: parseInt($location.hash()),
                    onChangeLocation: function(url) {
                        $scope.$apply(() => $location.url(url));
                    }
                };
                $scope.store = createStore(reducer, {});
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });

    $routeProvider.when('/pulse/create', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams', 'AppState',
            function($scope, $location, $route, $routeParams, AppState) {
                $scope.Component = PulseEditApp;
                $scope.props = {
                    user: AppState.model.currentUser,
                    onChangeLocation: function(url) {
                        $scope.$apply(() => $location.url(url));
                    }
                };
                $scope.store = createStore(reducer, {});
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });

    $routeProvider.when('/pulse/:pulseId', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams', 'AppState',
            function($scope, $location, $route, $routeParams, AppState) {
                $scope.Component = PulseEditApp;
                $scope.props = {
                    user: AppState.model.currentUser,
                    pulseId: parseInt($routeParams.pulseId),
                    onChangeLocation: function(url) {
                        $scope.$apply(() => $location.url(url));
                    }
                };
                $scope.store = createStore(reducer, {});
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
