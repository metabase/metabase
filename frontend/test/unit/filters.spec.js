import 'metabase/filters';

describe('metabase.filters', function() {
    beforeEach(angular.mock.module('metabase.filters'));

    describe('interpolate', function() {
        beforeEach(angular.mock.module(function($provide) {
            $provide.value('version', 'TEST_VER');
        }));

        it('should replace VERSION', angular.mock.inject(function(interpolateFilter) {
            expect(interpolateFilter('before %VERSION% after')).toEqual('before TEST_VER after');
        }));
    });

    describe('slice', function() {
        it('should slice the input array', angular.mock.inject(function(sliceFilter) {
            expect(sliceFilter([1, 2, 3, 4], 1, 3)).toEqual([2, 3]);
        }));
    });

    describe('isempty', function() {
        it('should not replace non-empty input', angular.mock.inject(function(isemptyFilter) {
            expect(isemptyFilter('non-empty', 'replaced')).toEqual('non-empty');
        }));

        it('should replace null input', angular.mock.inject(function(isemptyFilter) {
            expect(isemptyFilter(null, 'replaced')).toEqual('replaced');
        }));

        it('should replace empty input', angular.mock.inject(function(isemptyFilter) {
            expect(isemptyFilter('', 'replaced')).toEqual('replaced');
        }));
    });
});
