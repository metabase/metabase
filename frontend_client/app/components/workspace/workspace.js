'use strict';

angular.module('corvus.components')
    .directive('cvWorkspace', function () {

        function link (scope, element, attrs) {
        }

        return {
            restrict: 'E',
            templateUrl: '/app/components/workspace/workspace.html',
            transclude: true,
            scope: {},
            link: link
        };
    });
