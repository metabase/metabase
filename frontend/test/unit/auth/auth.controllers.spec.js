import 'metabase/auth/auth.controllers';

describe('metabase.auth.controllers', function() {
    beforeEach(angular.mock.module('metabase.auth.controllers'));

    describe('Login', function() {
        beforeEach(angular.mock.inject(function($location) {
            spyOn($location, 'path').and.returnValue('Fake location');
        }))

        it('should redirect logged-in user to /', inject(function($controller, $location) {
            $controller('Login', { $scope: {}, AppState: { model: { currentUser: {} }} });
            expect($location.path).toHaveBeenCalledWith('/');
        }));
    });
});
