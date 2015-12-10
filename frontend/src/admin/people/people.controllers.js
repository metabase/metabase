import { createStore, combineReducers } from "metabase/lib/redux";

import AdminPeopleApp from './containers/AdminPeopleApp.jsx';
import * as reducers from './reducers';

const reducer = combineReducers(reducers);


var PeopleControllers = angular.module('metabase.admin.people.controllers', ['metabase.services']);

PeopleControllers.controller('PeopleList', ['$scope', '$location', '$route', '$routeParams',
    function($scope, $location, $route, $routeParams) {

        $scope.Component = AdminPeopleApp;
        $scope.props = {
            user: $scope.user,
            onChangeLocation: function(url) {
                $scope.$apply(() => $location.url(url));
            }
        };
        $scope.store = createStore(reducer, {});
    }
]);
