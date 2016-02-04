import { createStore, combineReducers } from "metabase/lib/redux";

import DashboardApp from './containers/DashboardApp.jsx';
import * as reducers from './reducers';

const reducer = combineReducers(reducers);

//  Dashboard Controllers
var DashboardControllers = angular.module('metabase.dashboard.controllers', []);

DashboardControllers.controller('Dashboard', ['$scope', '$rootScope', '$routeParams', '$location', function($scope, $rootScope, $routeParams, $location) {
    $scope.Component = DashboardApp;
    $scope.props = {
        onChangeLocation: function(url) {
            $scope.$apply(() => $location.url(url));
        },
        onDashboardDeleted: function(id) {
            $scope.$apply(() => $rootScope.$broadcast("dashboard:delete", id));
        }
    };
    $scope.store = createStore(reducer, { selectedDashboard: $routeParams.dashId });
    // $scope.monitor = LogMonitor;
}]);
