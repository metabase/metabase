'use strict';

angular.module('corvus.components').directive('selectableNavItem', ['$location', function(location) {
    function link(scope, element, attrs) {
        attrs.$observe('href', function (value) {
            if (!value) return;

            var path = value.substring(0).split('/')[1],
                activeClass = 'is--selected';

            // hijack location into our local scope so it can be watched
            scope.location = location;

            scope.$watch('location.path()', function(newPath) {
                // grab the root name of the path
                var root = newPath.substring(0).split('/')[1];
                if (path == root) {
                    element.addClass(activeClass);
                } else {
                    element.removeClass(activeClass);
                }
            });
        });
    }

    return {
        restrict: 'A',
        link: link,
        scope: {}
    };
}]);
