'use strict';

import { loadIcon } from 'metabase/icon_paths';

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
            template: '<svg class="Icon" id="{{name}}" viewBox="{{viewBox}}" ng-attr-width="{{width}}" ng-attr-height="{{height}}" fill="{{fill}}"><path ng-attr-d="{{path}}" /></svg>',
            scope: {
                width: '@?',  // a value in PX to define the width of the icon
                height: '@?', // a value in PX to define the height of the icon
                name: '@',    // the name of the icon to be referended from the ICON_PATHS object
                path: '@',
                'class': '@',
                viewBox: '@',
                fill: '@'
            },
            compile: function (element, attrs) {
                var icon = loadIcon(attrs.name);

                if (icon.svg) {
                    console.warn("mbIcon does not yet support raw SVG");
                } else if (icon.path) {
                    attrs.path = attrs.path || icon.path;
                }

                for (var attr in icon.attrs) {
                    if (attrs[attr] == undefined) {
                        attrs[attr] = icon.attrs[attr];
                    }
                }
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
