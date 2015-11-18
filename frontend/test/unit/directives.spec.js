import 'metabase/directives';

describe('metabase.directives', function() {
    beforeEach(angular.mock.module('metabase.directives'));

    describe('mb-scroll-shadow', function() {
        var element;
        beforeEach(angular.mock.inject(function($compile, $rootScope) {
            element = $compile('<div mb-scroll-shadow style="height: 10px; overflow-y: scroll;"><div style="height: 20px;">x</div></div>')($rootScope);
            angular.element(document.body).append(element); // must be added to the body to scrolling stuff to work
        }));

        it('should not add the ScrollShadow class on scroll if scrollTop is 0', function() {
            element[0].scrollTop = 0;
            element.triggerHandler('scroll');
            expect(element.hasClass('ScrollShadow')).toBe(false);
        });

        it('should add the ScrollShadow class if scrollTop is greater than 0', function() {
            element[0].scrollTop = 5;
            element.triggerHandler('scroll');
            expect(element.hasClass('ScrollShadow')).toBe(true);
        });

        it('should remove the ScrollShadow class on scroll if scrollTop is 0', function() {
            element.addClass('ScrollShadow');
            element[0].scrollTop = 0;
            element.triggerHandler('scroll');
            expect(element.hasClass('ScrollShadow')).toBe(false);
        });
    })
});
