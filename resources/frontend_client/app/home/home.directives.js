'use strict';

var HomeDirectives = angular.module('metabase.home.directives', []);

HomeDirectives.directive('mbNewUserOnboarding', ['$modal',
    function($modal) {
        function link(scope, element, attrs) {

            function openModal() {
                var modalInstance = $modal.open({
                    templateUrl: '/app/home/partials/modal_user_onboarding.html',
                    controller: ['$scope', '$modalInstance',
                        function($scope, $modalInstance) {

                            $scope.firstStep = true;
                            $scope.user = scope.user;

                            $scope.next = function() {
                                $scope.firstStep = false;
                            };

                            $scope.close = function() {
                                $modalInstance.dismiss('cancel');
                            };
                        }
                    ]
                });
            }

            // always start with the modal open
            openModal();
        }

        return {
            restrict: 'E',
            link: link
        };
    }
]);
