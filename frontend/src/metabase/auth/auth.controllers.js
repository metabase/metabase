import "./auth.services";

import MetabaseSettings from "metabase/lib/settings";

var AuthControllers = angular.module('metabase.auth.controllers', [
    'metabase.auth.services',
    'ipCookie',
    'metabase.services',
    'metabase.forms'
]);

AuthControllers.controller('Login', ['$scope', '$window', '$location', '$timeout', 'AuthUtil', 'Session', 'AppState',
    function($scope, $window, $location, $timeout, AuthUtil, Session, AppState) {
        function validEmail(email) {
            var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(email);
        }

        $scope.login = function(email, password, remember_me) {
            $scope.$broadcast("form:reset");

            if (!validEmail(email)) {
                $scope.$broadcast("form:api-error", {'data': {'errors': {'email': "Please enter a valid formatted email address."}}});
                return;
            }

            Session.create({
                'email': email,
                'password': password
            }, function (new_session) {
                // set a session cookie
                AuthUtil.setSession(new_session.id);

                // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
                $timeout(function() {
                    AppState.redirectAfterLogin();
                }, 300);
            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };

        $scope.resetPassword = function() {
            if ($window.OSX) $window.OSX.resetPassword();
            else             $location.path('/auth/forgot_password');
        };

        // do a quick check if the user is already logged in.  if so then send them somewhere better.
        if (AppState.model.currentUser) {
            $location.path('/');
        }
    }
]);


AuthControllers.controller('Logout', ['$scope', '$location', '$timeout', 'ipCookie', 'Session', function($scope, $location, $timeout, ipCookie, Session) {

    // any time we hit this controller just clear out anything session related and move on
    if (ipCookie('metabase.SESSION_ID')) {
        var sessionId = ipCookie('metabase.SESSION_ID');

        // delete the current session cookie
        ipCookie.remove('metabase.SESSION_ID');

        // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
        $timeout(function() {
            // don't actually need to do anything here
            $scope.$emit('appstate:logout', sessionId);

            // only sensible place to go after logout is login page
            $location.path('/auth/login');
        }, 300);
    } else {
        // only sensible place to go after logout is login page
        $location.path('/auth/login');
    }
}]);


AuthControllers.controller('ForgotPassword', ['$scope', '$cookies', '$location', 'Session', function($scope, $cookies, $location, Session) {

    $scope.sentNotification = false;

    $scope.emailConfigured = MetabaseSettings.isEmailConfigured()

    $scope.sendResetNotification = function(email) {
        Session.forgot_password({
            'email': email
        }, function (result) {
            $scope.sentNotification = true;
        }, function (error) {
            $scope.$broadcast("form:api-error", error);
        });
    };

}]);


AuthControllers.controller('PasswordReset', ['$scope', '$routeParams', '$location', 'AuthUtil', 'Session', function($scope, $routeParams, $location, AuthUtil, Session) {
    // first, we need to ask the API if this token is expired. If so, so the expired token page. Otherwise, show the password reset page
    Session.password_reset_token_valid({
        token: $routeParams.token
    }, function(result) {
        if (!result.valid) {
            $location.path('/auth/password_reset_token_expired');
            return;
        }

        $scope.resetSuccess = false;
        $scope.passwordComplexity = MetabaseSettings.passwordComplexity(false);
        $scope.newUserJoining = ($location.hash() === 'new');

        $scope.resetPassword = function(password) {
            $scope.$broadcast("form:reset");

            if (password != $scope.password2) {
                $scope.$broadcast("form:api-error", {'data': {'errors': {'password2': "Passwords do not match"}}});
                return;
            }

            Session.reset_password({
                'token': $routeParams.token,
                'password': password
            }, function (result) {
                $scope.resetSuccess = true;

                // we should have a valid session that we can use immediately now!
                if (result.session_id) {
                    AuthUtil.setSession(result.session_id);
                }

            }, function (error) {
                $scope.$broadcast("form:api-error", error);
            });
        };
    }, function(error) {
        $scope.$broadcast('form:api-error', error);
    });
}]);
