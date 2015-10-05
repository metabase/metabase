import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";

import HomepageApp from './containers/HomepageApp.react';
import * as reducers from './reducers';
import { setSelectedTab } from './actions';

// import { devTools, persistState } from 'redux-devtools';
// import { LogMonitor } from 'redux-devtools/lib/react';
// import loggerMiddleware from 'redux-logger';

const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
      // ,loggerMiddleware
  ),
  // devTools(),
  // persistState(window.location.href.match(/[?&]debug_session=([^&]+)\b/)),
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
    $scope.store = finalCreateStore(reducer, { selectedTab: 'activity' });

    // $scope.monitor = LogMonitor;

    // mildly hacky way to prevent reloading controllers as the URL changes
    var route = $route.current;
    $scope.$on('$locationChangeSuccess', function (event) {
        var newParams = $route.current.params;
        var oldParams = route.params;

        if ($route.current.$$route.controller === 'Homepage') {
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

    $scope.routeParams = $routeParams;
    $scope.$watch('routeParams', function() {
        if ($scope.routeParams.questions === true) {
            $scope.store.dispatch(setSelectedTab('cards'));
        } else {
            $scope.store.dispatch(setSelectedTab('activity'));
        }
    }, true);
}]);
