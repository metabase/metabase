'use strict';

// wrap in a closure so we don't expose any of these functions to the outside world
(function() {
    // define our icons. currently uppercase to handle directive names properly
    var icons = [
        'Add',
        'Cards',
        'Close',
        'ChevronDown',
        'ChevronRight',
        'Dashboards',
        'Explore',
        'Grid',
        'List',
        'Loading',
        'Search',
        'Star'
    ];

    // ensure icons have proper defaults during the compile step if none are supplied
    function iconCompile (element, attrs) {
        var defaultWidth = '32px',
            defaultHeight = '32px';

        attrs.width = attrs.width || defaultWidth;
        attrs.height = attrs.height || defaultHeight;
    }

    // generate the directive
    function generateIconDirective (name) {
        var templatePrefix = '/app/components/icons/';

        return angular.module('corvus.components')
                    .directive('cv' + name + 'Icon', function () {
                        return {
                            restrict: 'E',
                            templateUrl: templatePrefix + name.toLowerCase() + '.html',
                            scope: {
                                width: '@?', // a value in PX to define the width of the icon
                                height: '@?' // a value in PX to define the height of the icon
                            },
                            compile: iconCompile
                        };
                    });
    }

    // for every defined icon, generate a directive
    for(var icon in icons) {
        generateIconDirective(icons[icon]);
    }

}());

