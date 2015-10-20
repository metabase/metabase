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


// UserControllers.controller('PasswordUpdateController', ['$scope', 'User',
//     function($scope, User) {

//         $scope.passwordComplexity = MetabaseSettings.passwordComplexity(true);

//         $scope.save = function(passwordDetails) {
//             $scope.$broadcast("form:reset");

//             // check that confirm password matches new password
//             if (passwordDetails.password !== passwordDetails.password2) {
//                 $scope.$broadcast("form:api-error", {'data': {'errors': {'password2': "Passwords do not match"}}});
//                 return;
//             }

//             User.update_password({
//                 'id': $scope.user.id,
//                 'password': passwordDetails.password,
//                 'old_password': passwordDetails.old_password
//             }, function (result) {
//                 $scope.$broadcast("form:api-success", "Password updated successfully!");

//             }, function (error) {
//                 $scope.$broadcast("form:api-error", error);
//             });
//         };

//         $scope.passwordDetails = {};
//     }
// ]);
