'use strict';
/*global _*/

//  Dashboard Controllers
var DashboardControllers = angular.module('corvus.dashboard.controllers', []);

DashboardControllers.controller('DashList', ['$scope', '$location', 'Dashboard', function($scope, $location, Dashboard) {
    $scope.dashboards = [];

    Dashboard.list({
        'filterMode': 'all'
    }, function (dashes) {
        $scope.dashboards = dashes;
    }, function (error) {
        console.log('error getting dahsboards list', error);
    });
}]);

DashboardControllers.controller('DashDetail', ['$scope', '$routeParams', '$location', 'Dashboard', 'DashCard', function($scope, $routeParams, $location, Dashboard, DashCard) {

    // $scope.dashboard: single Card being displayed/edited
    // $scope.error: any relevant error message to be displayed

    $scope.dashEdit = false;
    var origDescription;
    $scope.modalShown = false;
    $scope.sendCardId = null;

    $scope.cardSettings = {
        "allowFavorite":true,
        "allowAddToDash":true,
        "allowCardPermalink":true,
        "allowLinkToComments":true,
        "allowSend":true,
        "allowChangeCardSize": true,
        "allowTitleEdits": false
    };

    var processResize = function(event, $element, item){
        $element.scope().$broadcast('cv-gridster-item-resized', $element);
        savePosition();
    };

    var savePosition = function() {
        Dashboard.reposition_cards({
            'dashId': $scope.dashboard.id,
            'cards': $scope.dashcards
        });
    };

    $scope.gridsterOptions = {
        columns: 6,
        /* Cards height collapses to 0 if window size < mobileBreakPoint,
         * preventing cards from rendering properly. Also happens if browser
         * window is set to < 600px, even without mobileBreakPoint set.
         */
        //mobileBreakPoint: 640,
        floating: false,
        pushing: false,
        swapping: true,
        resizable: {
            enabled: false,
            handles: ['n', 's', 'e', 'w', 'se', 'sw'],
            stop: processResize
        },
        draggable: {
            enabled: false,
            stop: savePosition
        }
    };

    $scope.editingText = "Edit layout";

    $scope.toggleDashEditMode = function() {
        if ($scope.editingClass == "Dash--editing") {
            $scope.editingClass = "";
        } else {
            $scope.editingClass = "Dash--editing";
        }
        if ($scope.editingText == "Done") {
            $scope.editingText = "Edit layout";
        }
        else {
            $scope.editingText = "Done";
        }
        $scope.gridsterOptions.draggable.enabled = !$scope.gridsterOptions.draggable.enabled;
        $scope.gridsterOptions.resizable.enabled = !$scope.gridsterOptions.resizable.enabled;
    };

    $scope.dashboardLoaded = false;
    $scope.dashboardLoadError = null;


    if ($routeParams.dashId) {
        Dashboard.get({
            'dashId': $routeParams.dashId
        }, function(result) {
            $scope.dashboard = result.dashboard;

            var cards = result.dashboard.ordered_cards;

            $scope.dashcards = cards;
            $scope.dashboardLoaded = true;

        }, function (error) {
            $scope.dashboardLoaded = true;

            if (error.status == 404) {
                $location.path('/');
            } else if (error.message) {
                $scope.dashboardLoadError = error.message;
            } else {
                $scope.dashboardLoadError = "Hmmm.  We had a problem loading this dashboard for some reason :(";
            }
        });
    }

    $scope.create = function(dashboard) {
        Dashboard.create(dashboard, function(result) {
            if (result && !result.error) {
                // just go to the new dashboard
                $location.path('/dash/' + result.id);
            } else {
                console.log(result);
            }
        });
    };

    $scope.save = function(dashboard) {
        Dashboard.update(dashboard, function(result) {
            if (result && !result.error) {
                // just go back to view page after a save
                $location.path('/dash/' + result.id);
            }
        });
    };

    $scope.inlineSave = function (dash) {
        Dashboard.update(dash, function (result) {
            // NOTE: we don't replace $scope.dashboard here because if we did that would cause the whole
            //       dashboard to relaod based on our page setup, which we don't want.

            // if DashEdit = true then assume user is inline editing and lets clear that
            $scope.dashEdit = false;
            origDescription = undefined;

        }, function (error) {
            console.log('error with inline save of dashboard', error);
        });
    };

    $scope.removeCard = function(idx) {
        Dashboard.removecard({
            'dashId': $routeParams.dashId,
            'dashcardId': $scope.dashboard.ordered_cards[idx].id
        }, function(result) {
            $scope.dashboard.ordered_cards.splice(idx, 1);
        });
    };

    $scope.toggleDashEdit = function () {
        if ($scope.dashEdit) {
            // already in edit mode, so must be cancelling
            $scope.dashEdit = !$scope.dashEdit;
            $scope.dashboard.description = origDescription;
            origDescription = undefined;
        } else {
            // not in edit mode, so just showing edit controls and save the orig description
            $scope.dashEdit = !$scope.dashEdit;
            origDescription = $scope.dashboard.description;
        }
    };
}]);
