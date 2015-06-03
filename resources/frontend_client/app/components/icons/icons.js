'use strict';
/* global ICON_PATHS */

/*
    GENERIC ICONS

    USAGE:
        Angular: <mb-icon name="<NAME FROM ICON_PATHS>" width="<PIXEL VALUE>" height="<PIXEL VALUE"></mb-icon>
        React: <Icon name="<NAME FROM ICON_PATHS>" width="<PIXEL VALUE>" height="<PIXEL VALUE>" />
*/

angular.module('corvus.components')
    .directive('mbIcon', function () {

        return {
            restrict: 'E',
            template: '<svg class="Icon" id="{{name}}" viewBox="0 0 32 32" ng-attr-width="{{width}}" ng-attr-height="{{height}}" fill="currentcolor"><path ng-attr-d="{{path}}" /></svg>',
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

/* SPECIALTY ICONS */

(function() {
    /* generic function to use for width and height defaults */
    function iconCompile(element, attrs, defaultWidth, defaultHeight) {
        attrs.width = attrs.width || '32px';
        attrs.height = attrs.height || '32px';
    }

    var ICON_SCOPE = {
        width: '@?',  // a value in PX to define the width of the icon
        height: '@?', // a value in PX to define the height of the icon
    };


    angular.module('corvus.components')
        .directive('mbLogoIcon', function () {
            return {
                restrict: 'E',
                templateUrl: '/app/components/icons/logo.html',
                scope: ICON_SCOPE,
                compile: iconCompile
            };
        });

    angular.module('corvus.components')
        .directive('mbLoadingIcon', function () {
            return {
                restrict: 'E',
                templateUrl: '/app/components/icons/loading.html',
                scope: ICON_SCOPE,
                compile: iconCompile
            };
        });

}());
