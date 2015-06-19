'use strict';

import 'metabase/controllers';

describe('corvus.controllers', function() {
    beforeEach(angular.mock.module('corvus.controllers'));

    describe('Homepage', function() {
        beforeEach(angular.mock.inject(function($location) {
            spyOn($location, 'path').and.returnValue('Fake location');
        }))

        it('should redirect logged-out user to /auth/login', inject(function($controller, $location) {
            $controller('Homepage', { $scope: {}, AppState: { model: { currentUser: null }} });
            expect($location.path).toHaveBeenCalledWith('/auth/login');
        }));

        it('should redirect logged-in user to /dash/', inject(function($controller, $location) {
            $controller('Homepage', { $scope: {}, AppState: { model: { currentUser: {} }} });
            expect($location.path).toHaveBeenCalledWith('/dash/');
        }));
    });
});
