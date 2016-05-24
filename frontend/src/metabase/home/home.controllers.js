import { createStore, combineReducers } from "metabase/lib/redux";

import HomepageApp from './containers/HomepageApp.jsx';
import * as reducers from './reducers';

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
    $scope.store = createStore(reducer, { });
}]);
