"use strict";
/*global btoa*/
/*global $*/

//  Admin Controllers
var AdminControllers = angular.module('corvusadmin.index.controllers', ['corvus.services']);

AdminControllers.controller('AdminHome', ['$scope', 'Organization', function($scope, Organization) {

    $scope.updateOrg = function(organization) {
        Organization.update(organization, function (org) {
            $scope.currentOrg = org;
            $scope.alertInfo('Organization settings updated!');

            // we need to trigger a refresh of $scope.user so that these changes propogate the UI
            $scope.refreshCurrentUser();

        }, function (error) {
            console.log('error', error);
            $scope.alertError('Update failed!');
        });
    };

    Organization.form_input(function (result) {
        $scope.form_input = result;
    }, function (error) {
        console.log('error getting form input', error);
    });
}]);

AdminControllers.controller('TestLoginForm', ['$scope', function($scope) {
    $scope.doLogin = function(loginForm) {
        $scope.formStatus = "";
        function setHeader(xhr) {
            xhr.setRequestHeader ("Authorization", "Basic " + btoa(loginForm.username + ":" + loginForm.password));
        }

        $.ajax({
            type: "GET",
            url: "/api/user/login",
            beforeSend: setHeader
        }).fail(function(resp) {
            $scope.formStatus = "login failed";
            $scope.$digest();
            console.log("bad credentials");
        }).
            done(function(resp) {
                console.log("login successful");
                console.dir(resp);
                $scope.formStatus = "login successful";
                $scope.$digest();
            });
    };

    $scope.doLogout = function() {
        $.ajax({
            type: "GET",
            url: "/api/user/logout"
        }).fail(function(resp) {
            $scope.formStatus = "logout failed: " + resp;
            $scope.$digest();
        }).done(function(resp) {
            $scope.formStatus = "logout successful";
            $scope.$digest();
        });
    };
}]);
