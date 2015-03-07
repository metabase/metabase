'use strict';

/* Filters */

var CorvusFilters = angular.module('corvus.filters', []);

CorvusFilters.filter('interpolate', ['version', function(version) {
    return function(text) {
        return String(text).replace(/\%VERSION\%/mg, version);
    };
}]);

CorvusFilters.filter('slice', function() {
    return function(arr, start, end) {
        return arr.slice(start, end);
    };
});

CorvusFilters.filter('isempty', function() {
    return function(input, replaceText) {
        if (input) {
            return input;
        } else {
            return replaceText;
        }
    };
});
