var AuthServices = angular.module('metabase.auth.services', []);

AuthServices.service('AuthUtil', ['$rootScope', '$location', 'ipCookie', function($rootScope, $location, ipCookie) {

    this.setSession = function(sessionId) {
        // set a session cookie
        var isSecure = ($location.protocol() === "https") ? true : false;
        ipCookie('metabase.SESSION_ID', sessionId, {
            path: '/',
            expires: 14,
            secure: isSecure
        });

        // send a login notification event
        $rootScope.$broadcast('appstate:login', sessionId);
    };

}]);
