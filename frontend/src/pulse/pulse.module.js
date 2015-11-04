import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";

import PulseApp from './containers/PulseApp.jsx';
import * as reducers from './reducers';

const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
  ),
  createStore
);

const reducer = combineReducers(reducers);

var Pulse = angular.module('metabase.pulse', []);

Pulse.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/pulse', {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams',
            function($scope, $location, $route, $routeParams) {
                $scope.Component = PulseApp;
                $scope.props = {};
                $scope.store = finalCreateStore(reducer, {});
            }
        ]
    });
}]);
