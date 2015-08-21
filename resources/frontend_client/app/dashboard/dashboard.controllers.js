'use strict';
/*global _*/

import MetabaseAnalytics from '../lib/analytics';

import React, { Component } from 'react';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import { devTools, persistState } from 'redux-devtools';
import { LogMonitor } from 'redux-devtools/lib/react';

import promiseMiddleware from 'redux-promise';
import loggerMiddleware from 'redux-logger';
import thunkMidleware from "redux-thunk";

import DashboardApp from './containers/DashboardApp.react';
import * as reducers from './reducers';

const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
      //,loggerMiddleware
  ),
  // devTools(),
  // persistState(window.location.href.match(/[?&]debug_session=([^&]+)\b/)),
  createStore
);

const reducer = combineReducers(reducers);

//  Dashboard Controllers
var DashboardControllers = angular.module('corvus.dashboard.controllers', []);

DashboardControllers.controller('Dashboard', ['$scope', '$routeParams', '$location', 'VisualizationSettings', function($scope, $routeParams, $location, VisualizationSettings) {
    $scope.Component = DashboardApp;
    $scope.props = {
        visualizationSettingsApi: VisualizationSettings,
        onChangeLocation: function(url) {
            $scope.$apply(() => $location.url(url))
        }
    };
    $scope.store = finalCreateStore(reducer, { selectedDashboard: $routeParams.dashId });
    // $scope.monitor = LogMonitor;
}]);

DashboardControllers.controller('DashList', ['$scope', '$location', 'Dashboard', function($scope, $location, Dashboard) {
    $scope.dashboards = [];

    var refreshListing = function() {
        Dashboard.list({
            'filterMode': 'all'
        }, function (dashes) {
            $scope.dashboards = dashes;
        }, function (error) {
            console.log('error getting dahsboards list', error);
        });
    };

    $scope.$on("dashboard:create", function(event, dashboardId) {
        refreshListing();
    });

    $scope.$on("dashboard:delete", function(event, dashboardId) {
        refreshListing();
    });

    $scope.$on("dashboard:update", function(event, dashboardId) {
        refreshListing();
    });

    // always initialize with a fresh listing
    refreshListing();
}]);
