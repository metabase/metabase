'use strict';
/*global _*/

//  Dashboard Controllers
var DashboardControllers = angular.module('corvus.dashboard.controllers', []);

DashboardControllers.controller('DashList', ['$scope', '$location', 'Dashboard', function($scope, $location, Dashboard) {
    var sort;

    // $scope.dashboards: the list of dashboards being displayed

    $scope.deleteDash = function(dashId) {
        Dashboard.delete({
            'dashId': dashId
        }, function(result) {
            $scope.dashboards = _.filter($scope.dashboards, function(dashboard){
                return dashboard.id != dashId;
            });
            $scope.searchFilter = undefined;
        });
    };

    $scope.inlineSave = function(dash, idx) {
        Dashboard.update(dash, function(result) {
            if (result && !result.error) {
                $scope.dashboards[idx] = result;
            } else {
                return "error";
            }
        });
    };

    $scope.filter = function(filterMode) {
        $scope.filterMode = filterMode;

        Dashboard.list({
            'filterMode': filterMode
        }, function (dashes) {
            $scope.dashboards = dashes;

            sort = undefined;
            $scope.sort(sort, false);
        }, function (error) {
            console.log('error getting dahsboards list', error);
        });
    };

    $scope.sort = function(sortMode) {
        // if someone asks for the same sort mode again, reverse the order
        if (sortMode && sortMode == sort) {
            $scope.dashboards.reverse();
            sort = undefined;
            return;
        }

        sort = sortMode;
        if (!sort) {
            sort = 'name';
        }

        if ('date' == sortMode) {
            $scope.dashboards.sort(function(a, b) {
                a = new Date(a.updated_at);
                b = new Date(b.updated_at);
                return a > b ? -1 : a < b ? 1 : 0;
            });
        } else if ('owner' == sortMode) {
            $scope.dashboards.sort(function(a, b) {
                return a.creator.email.localeCompare(b.creator.email);
            });
        } else {
            // default mode is by dashboard name
            $scope.dashboards.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
        }
    };

    // default view on page load is to show all dashboards
    $scope.filter('all');
}]);

DashboardControllers.controller('DashListForCard', ['$scope', '$routeParams', '$location', 'Dashboard', 'Card', function($scope, $routeParams, $location, Dashboard, Card) {
    var sort;

    // $scope.dashboards: the list of dashboards being displayed

    $scope.filter = function(filterMode) {
        Dashboard.for_card({
            'filterMode': filterMode,
            'cardId': $routeParams.cardId
        }, function(result) {
            $scope.dashboards = result;
        }, function(errorResponse) {
            console.dir(errorResponse);
            throw "unable to get card dashboards for card " + $routeParams.cardId + "; status: " + errorResponse.status + " (" + errorResponse.statusText + "); see log above for details";
        });
    };

    // default view on page load is to show all dashboards
    $scope.filter('all');

    Card.get({
        cardId: $routeParams.cardId
    }, function(card) {
        $scope.cardName = card.name;
    }, function(errorResponse) {
        console.dir(errorResponse);
        if (errorResponse.status == 404) {
            $location.path('/');
        } else {
            throw "unable to get card name for card " + $routeParams.cardId + "; status: " + errorResponse.status + " (" + errorResponse.statusText + "); see log above for details";
        }
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


    if ($routeParams.dashId) {
        Dashboard.get({
            'dashId': $routeParams.dashId
        }, function(result) {
            $scope.dashboard = result.dashboard;

            var cards = result.dashboard.ordered_cards;

            $scope.dashcards = cards;
            $scope.dashboardLoaded = true;

        }, function (error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
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

    $scope.toggleCardSendModal = function(idx) {

        // toggle display
        $scope.modalShown = !$scope.modalShown;
        $scope.sendCardId = $scope.dashboard.ordered_cards[idx].card;
        $scope.sendCardTitle = $scope.dashboard.ordered_cards[idx].card;
    };

    $scope.cardSent = function() {
        $scope.alertInfo('Your card was successfully sent!');
    };

    $scope.toggleSubscribeButtonText = function() {
        if(!$scope.dashboard){
            return;
        }
        return $scope.dashboard.is_subscriber ? 'Unsubscribe' : 'Subscribe';
    };

    $scope.toggleSubscribe = function() {
        var action = $scope.dashboard.is_subscriber ? 'unsubscribe' : 'subscribe';
        Dashboard[action]({
            'dashId': $routeParams.dashId
        }, function(result) {
            $scope.dashboard.is_subscriber = !$scope.dashboard.is_subscriber;
        });
    };
}]);
