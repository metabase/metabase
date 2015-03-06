'use strict';
/*global _*/

var SearchControllers = angular.module('corvus.search.controllers', ['ngRoute', 'corvus.services']);

SearchControllers.controller('SearchController', ['$scope', '$routeParams', 'Search', 'CorvusAlert',
    function($scope, $routeParams, Search, CorvusAlert) {
        $scope.query = $routeParams.q || "";
        $scope.response = {};
        var RESULTS_PER_PAGE = 10;
        var MAX_PAGES = 10;
        var models = [];

        $scope.search = function(page_number) {
            if (typeof page_number == "undefined") {
                page_number = 1;
            }

            var searchQuery = {
                org: $scope.currentOrg.id,
                page: page_number,
                results_per_page: RESULTS_PER_PAGE,
                load_all: true
            };

            if ($scope.query) {
                searchQuery.q = $scope.query;
            }

            if (models) {
                searchQuery.models = models;
            }

            Search.search(searchQuery, function(response) {
                $scope.response = response;

                updatePagination(response);

            }, function(errorResponse) {
                console.log("error:");
                console.log(errorResponse);
                CorvusAlert.alertError("error getting search results");
                throw "error getting search results";
            });
        };

        $scope.changePageNumber = function(page_number) {
            $scope.search(page_number);
        };

        /*jshint validthis:true*/
        var updatePagination = function(response) {
            var pageRange = [];

            //fill out the paginator's page selector
            //with available pages to the left and to the
            //right of the currently-selected page
            var currentPageNumber = response.page.page_number;
            while (pageRange.length < MAX_PAGES / 2 && currentPageNumber > 0) {
                pageRange.unshift(currentPageNumber);
                currentPageNumber = currentPageNumber - 1;
            }
            currentPageNumber = response.page.page_number + 1;
            while (pageRange.length < MAX_PAGES && currentPageNumber <= response.page.num_pages) {
                pageRange.push(currentPageNumber);
                currentPageNumber = currentPageNumber + 1;
            }
            currentPageNumber = response.page.page_number - MAX_PAGES / 2;
            while (pageRange.length < MAX_PAGES && currentPageNumber > 0) {
                pageRange.unshift(currentPageNumber);
                currentPageNumber = currentPageNumber - 1;
            }

            $scope.pageRange = pageRange;
        };

        $scope.toggleModel = function(model) {
            var index = models.indexOf(model);
            if (index > -1) {
                //model already set - remove it
                models.splice(index, 1);
            } else {
                //model not already set - add it
                models.push(model);
            }
        };

        $scope.isModelSelected = function(model) {
            var index = models.indexOf(model);
            if (index > -1) {
                return true;
            } else {
                return false;
            }
        };

        $scope.isAdminResult = function(display_type) {
            return display_type === 'Query';
        };

        // as soon as we know our org we want to take action
        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            // we need some data about the choices available for searching
            Search.model_choices({
                org: org.id
            }, function(result) {
                $scope.dataChoices = result.choices.data;
                $scope.modelChoices = result.choices.metabase;
            }, function(errorResponse) {
                throw "ERROR getting model choices";
            });

            // fire off API call right away
            $scope.search();
        });

    }
]);