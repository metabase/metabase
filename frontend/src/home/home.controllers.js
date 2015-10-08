import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";

import HomepageApp from './containers/HomepageApp.jsx';
import * as reducers from './reducers';

const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
  ),
  createStore
);

const reducer = combineReducers(reducers);


var HomeControllers = angular.module('metabase.home.controllers', []);
HomeControllers.controller('Homepage', ['$scope', '$location', '$route', '$routeParams', function($scope, $location, $route, $routeParams) {
    $scope.Component = HomepageApp;
    $scope.props = {
        user: $scope.user,
        showOnboarding: ('new' in $location.search()),
        onChangeLocation: function(url) {
            $scope.$apply(() => $location.url(url));
        }
    };
    $scope.store = finalCreateStore(reducer, { });
}]);
