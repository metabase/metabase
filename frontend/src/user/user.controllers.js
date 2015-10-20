import { createStore, applyMiddleware, combineReducers, compose } from 'redux';
import promiseMiddleware from 'redux-promise';
import thunkMidleware from "redux-thunk";

import UserSettingsApp from './containers/UserSettingsApp.jsx';
import * as reducers from './reducers';


const finalCreateStore = compose(
  applyMiddleware(
      thunkMidleware,
      promiseMiddleware
  ),
  createStore
);

const reducer = combineReducers(reducers);


var UserControllers = angular.module('metabase.user.controllers', []);

UserControllers.controller('EditCurrentUser', ['$scope', '$location', '$route', '$routeParams',
    function($scope, $location, $route, $routeParams) {

        $scope.Component = UserSettingsApp;
        $scope.props = {
            user: angular.copy($scope.user)
        };
        $scope.store = finalCreateStore(reducer, {});
    }
]);
