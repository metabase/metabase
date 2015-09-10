'use strict';

import Table from "metabase/lib/table";

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


var HomeControllers = angular.module('metabase.home.controllers', [
    'metabase.home.directives',
    'metabase.metabase.services'
]);

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
    // TODO: reflect onboarding state

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


HomeControllers.controller('HomeDatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {

    $scope.databases = [];
    $scope.currentDB = {};
    $scope.tables = [];

    Metabase.db_list(function (databases) {
        $scope.databases = databases;
        $scope.selectCurrentDB(0)
    }, function (error) {
        console.log(error);
    });


    $scope.selectCurrentDB = function(index) {
        $scope.currentDB = $scope.databases[index];
        Metabase.db_tables({
            'dbId': $scope.currentDB.id
        }, function (tables) {
            $scope.tables = tables.filter(Table.isQueryable);
        }, function (error) {
            console.log(error);
        })
    }
}]);
