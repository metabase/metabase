/* Filters */

var MetabaseFilters = angular.module('metabase.filters', []);

MetabaseFilters.filter('interpolate', ['version', function(version) {
    return function(text) {
        return String(text).replace(/\%VERSION\%/mg, version);
    };
}]);

MetabaseFilters.filter('slice', function() {
    return function(arr, start, end) {
        return arr.slice(start, end);
    };
});

MetabaseFilters.filter('isempty', function() {
    return function(input, replaceText) {
        if (input) {
            return input;
        } else {
            return replaceText;
        }
    };
});
