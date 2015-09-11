'use strict';

import CreateDashboardModal from '../components/CreateDashboardModal.react';

var DashboardDirectives = angular.module('metabase.dashboard.directives', [
    'metabase.metabase.services',
]);

DashboardDirectives.directive('mbDashboardCreate', ['Dashboard', '$modal', '$location', '$rootScope',
    function(Dashboard, $modal, $location, $rootScope) {
        function link(scope, element, attrs) {

            var openModal = function() {
                $modal.open({
                    template: '<div class="Modal" mb-react-component="CreateDashboardModal"></div>',
                    controller: ['$scope', '$modalInstance',
                        function($scope, $modalInstance) {
                            $scope.CreateDashboardModal = CreateDashboardModal;
                            $scope.createDashboardFn = async function(newDashboard) {
                                var dashboard = await Dashboard.create(newDashboard).$promise;
                                $modalInstance.close(dashboard);
                                $rootScope.$broadcast("dashboard:create", dashboard.id);
                                $location.path("/dash/" + dashboard.id);
                            }
                            $scope.closeFn = function() {
                                $modalInstance.dismiss('cancel');
                            };
                        }
                    ]
                });
            };

            element.bind('click', openModal);
        }

        return {
            restrict: 'A',
            link: link,
            scope: {
                callback: '=',
                dashboard: '='
            }
        };
    }
]);
