import { createStore, combineReducers } from "metabase/lib/redux";

import UserSettingsApp from './containers/UserSettingsApp.jsx';
import * as reducers from './reducers';

const reducer = combineReducers(reducers);

var UserControllers = angular.module('metabase.user.controllers', []);

UserControllers.controller('EditCurrentUser', ['$scope', '$location', '$route', '$routeParams',
    function($scope, $location, $route, $routeParams) {

        $scope.Component = UserSettingsApp;
        $scope.props = {
            user: angular.copy($scope.user)
        };
        $scope.store = createStore(reducer, {});
    }
]);
