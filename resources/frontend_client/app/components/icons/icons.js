'use strict';

/* global ICON_PATHS */

angular.module('corvus.components')
    .directive('mbIcon', function () {

        return {
            restrict: 'E',
            template: '<svg viewBox="0 0 32 32" ng-attr-width="{{width}}" ng-attr-height="{{height}}" fill="currentcolor"><path ng-attr-d="{{path}}" /></svg>',
            scope: {
                width: '@?',  // a value in PX to define the width of the icon
                height: '@?', // a value in PX to define the height of the icon
                name: '@',    // the name of the icon to be referended from the ICON_PATHS object
                path: '@'
            },
            compile: function (element, attrs) {
                var icon = ICON_PATHS[attrs.name];

                // set defaults for width/height in case no width or height are specified
                attrs.width = attrs.width || '32px';
                attrs.height = attrs.height || '32px';
                attrs.path = icon;
            }
        };
    });
