'use strict';
/*jslint browser:true*/
/*jslint devel:true */
/*global _*/
/*global $*/

var AuthControllers = angular.module('corvus.auth.controllers', ['ipCookie', 'corvus.services']);

AuthControllers.controller('Login', ['$scope', '$location', '$timeout', 'ipCookie', 'Session', 'AppState', function($scope, $location, $timeout, ipCookie, Session, AppState) {

    var validEmail = function (email) {
        var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(email);
    }

    $scope.login = function(email, password, remember_me) {
        if (!email || !password) {
            $scope.error = "Email address and Password are required.";
            return;
        } else if (!validEmail(email)) {
            $scope.error = "Please enter a valid formatted email address.";
            return;
        }

        Session.create({
            'email': email,
            'password': password
        }, function (new_session) {
            // set a session cookie
            var isSecure = ($location.protocol() === "https") ? true : false;
            ipCookie('metabase.SESSION_ID', new_session.id, {path: '/', expires: 14, secure: isSecure});

            // send a login notification event
            $scope.$emit('appstate:login', new_session.id);

            // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
            $timeout(function() {
                // we expect the homepage to handle the routing details about where the user should be going
                $location.path('/');
            }, 300);
        }, function (error) {
            $scope.error = "Invalid username/password combination specified.";
        });
    };

    // do a quick check if the user is already logged in.  if so then send them somewhere better.
    if (AppState.model.currentUser && AppState.model.currentUser.org_perms && AppState.model.currentUser.org_perms.length > 0) {
        $location.path('/'+AppState.model.currentUser.org_perms[0].organization.slug+'/');
    }
}]);


AuthControllers.controller('Logout', ['$scope', '$location', '$timeout', 'ipCookie', 'Session', function($scope, $location, $timeout, ipCookie, Session) {

    // any time we hit this controller just clear out anything session related and move on
    if ( ipCookie('metabase.SESSION_ID') ) {
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
    $scope.error = false;


    $scope.sendResetNotification = function (email) {
        Session.forgot_password({
            'email': email
        }, function (result) {
            console.log('notification sent');
            $scope.sentNotification = true;
        }, function (error) {
            if (error.status === 400) {
                $scope.error = "You must specify the email address of your account.";
            } else if (error.status === 404) {
                $scope.error = "Could not find a user for the given email address.";
            } else {
                $scope.error = "Error triggering password reset.  Please ask the system administrator for assistance.";
            }
        });
    }

}]);


AuthControllers.controller('PasswordReset', ['$scope', '$routeParams', '$location', 'Session', function($scope, $routeParams, $location, Session) {

    $scope.resetSuccess = false;
    $scope.error = false;

    // TODO - check for password matching
    // TODO - check for password strength

    $scope.resetPassword = function (password) {
        Session.reset_password({
            'token': $routeParams.token,
            'password': password
        }, function (result) {
            $scope.resetSuccess = true;
        }, function (error) {
            if (error.status === 400) {
                $scope.error = "You must specify a valid password.";
            } else if (error.status === 404) {
                $scope.error = "Invalid reset token specified.";
            } else {
                $scope.error = "Error resetting password.  Please ask the system administrator for assistance.";
            }
        });
    }

}]);
