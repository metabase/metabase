import { loadIcon } from 'metabase/icon_paths';

/*
    GENERIC ICONS

    USAGE:
        Angular: <mb-icon name="<NAME FROM ICON_PATHS>" width="<PIXEL VALUE>" height="<PIXEL VALUE"></mb-icon>
        React: <Icon name="<NAME FROM ICON_PATHS>" width="<PIXEL VALUE>" height="<PIXEL VALUE>" />
*/

angular.module('metabase.components')
    .directive('mbIcon', function () {

        return {
            restrict: 'E',
            // NOTE: can't use ng-attr-viewBox because Angular doesn't preserve the case pre-v1.3.7 :(
            template: '<svg viewBox="0 0 32 32" ng-attr-class="{{className}}" ng-attr-width="{{width}}" ng-attr-height="{{height}}" ng-attr-fill="{{fill}}"><path ng-attr-d="{{path}}" /></svg>',
            scope: {
                width: '@?',  // a value in PX to define the width of the icon
                height: '@?', // a value in PX to define the height of the icon
                name: '@',    // the name of the icon to be referended from the ICON_PATHS object
                path: '@',
                className: '@',
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


    angular.module('metabase.components')
        .directive('mbLogoIcon', function () {
            return {
                restrict: 'E',
                templateUrl: '/app/components/icons/logo.html',
                scope: ICON_SCOPE,
                compile: iconCompile
            };
        });

}());
