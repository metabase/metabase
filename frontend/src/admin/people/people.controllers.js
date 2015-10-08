import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";

import AdminPeopleApp from './containers/AdminPeopleApp.jsx';
import * as reducers from './reducers';


const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
  ),
  createStore
);

const reducer = combineReducers(reducers);


var PeopleControllers = angular.module('metabaseadmin.people.controllers', ['metabase.services']);

PeopleControllers.controller('PeopleList', ['$scope', '$location', '$route', '$routeParams',
    function($scope, $location, $route, $routeParams) {

        $scope.Component = AdminPeopleApp;
        $scope.props = {
            user: $scope.user,
            onChangeLocation: function(url) {
                $scope.$apply(() => $location.url(url));
            }
        };
        $scope.store = finalCreateStore(reducer, {});
    }
]);
