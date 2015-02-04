'use strict';

var DashboardDirectives = angular.module('corvus.dashboard.directives', []);

DashboardDirectives.directive('cvAddToDashboardModal', ['CorvusCore', 'Dashboard', 'Metabase', 'Card', '$modal', function(CorvusCore, Dashboard, Metabase, Card, $modal) {
    function link(scope, element, attrs) {

        var openAddToDashModal = function() {

            var modalInstance = $modal.open({

                templateUrl: '/app/dashboard/partials/modal_add_to_dashboard.html',
                controller: ['$scope', '$modalInstance', 'CorvusAlert', 'CorvusFormService', 'card', function($scope, $modalInstance, CorvusAlert, CorvusFormService, card) {
                    var formName = 'addCardToDash';

                    // create an object for the add to dash form
                    $scope.addToDashForm = {};
                    $scope.card = card;
                    $scope.alerts = CorvusAlert.alerts;

                    var cardAdd = function(cardId, dashId) {
                        Dashboard.addcard({
                            'dashId': dashId,
                            'cardId': cardId
                        }, function(result) {
                            // success!!
                            if (typeof existingDashboardsById[dashId] != "undefined") {
                                CorvusAlert.alertInfo('This card has been added to the dashboard: ' + existingDashboardsById[dashId].name + '</a>');
                            } else {
                                CorvusAlert.alertInfo('This card' + ' has been added to the specified dashboard!');
                            }
                            $modalInstance.close();
                        }, function(error) {
                            CorvusAlert.alertError('Unable to add card to the specified dashboard!');
                            console.log(error);
                        });
                    };

                    //we need to create a local index of dashboard objects that can been
                    //queried by ID, so that the view can show the name of the
                    //dashboard that a card was added to
                    var existingDashboardsById = {};

                    Dashboard.list({
                        'orgId': $scope.card.organization.id,
                        'filterMode': 'all'
                    }, function(result) {
                        if (result && !result.error) {
                            $scope.dashboards = result;
                            for (var i = 0; i < result.length; i++) {
                                existingDashboardsById[result[i].id] = result[i];
                            }
                        } else {
                            console.log(result);
                        }
                    });

                    $scope.submit = function() {
                        // if there is an existing dash
                        //  add the card to that dash
                        if ($scope.addToDashForm.existingDash) {
                            cardAdd($scope.card.id, $scope.addToDashForm.existingDash);
                        } else if ($scope.card) {
                            // populate a new Dash object
                            var newDash = {
                                'organization': $scope.card.organization.id,
                                'name': $scope.addToDashForm.newDashName,
                                'public_perms': 0
                            };

                            // create a new dashboard, then add the card to that
                            Dashboard.create(newDash, function(result) {
                                if (result && !result.error) {
                                    existingDashboardsById[result.id] = result;
                                    cardAdd(card.id, result.id);
                                } else {
                                    console.log(result);
                                    return;
                                }
                            });
                        } else {
                            console.log('error: no method for doing dashboard addition');
                        }
                    };

                    $scope.close = function() {
                        $modalInstance.dismiss('cancel');
                    };
                }],

                resolve: {
                    card: function() {
                        return scope.card;
                    }
                }
            });
        };
        element.click(openAddToDashModal);
    }

    return {
        restrict: 'A',
        link: link,
        scope: {
            callback: '=',
            card: '='
        }
    };
}]);
