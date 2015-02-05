'use strict';
/*global alert*/

var SearchAdminControllers = angular.module('corvusadmin.search.controllers', []);

SearchAdminControllers.controller('SearchAdminHome', ['$scope', 'Search', function($scope, Search) {
    $scope.reindexAll = function() {
        Search.reindexAll({}, function(response) {
            console.log(response);
            alert(response.status);
        }, function(error) {
            console.log(error);
            alert(error);
        });
    };
}]);