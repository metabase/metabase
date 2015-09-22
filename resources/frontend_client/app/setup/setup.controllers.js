'use strict';

import MetabaseSettings from 'metabase/lib/settings';

var SetupControllers = angular.module('metabase.setup.controllers', ['metabase.metabase.services', 'metabase.setup.services']);
SetupControllers.controller('SetupInfo', ['$scope', '$routeParams', '$location', '$timeout', 'ipCookie', 'User', 'AppState', 'Setup', 'Settings',
    function($scope, $routeParams, $location, $timeout, ipCookie, User, AppState, Setup, Settings) {

        console.log(window.MetabaseBootstrap);

        $scope.completedSteps = {
            welcome: true,
            user: true,
            database: false,
            usage: false
        };

        $scope.userStepText = 'What should we call you?';
        $scope.databaseStepText = 'Add your data';
        $scope.usageStepText = 'Usage data preferences';

        $scope.newUser = {};

        $scope.$on("database:created", function(event, database) {
            $timeout(function() {
                $scope.completedSteps.database = true;
                $scope.databaseStepText = 'Connected to '+database.name;
            });
        });

        var oldPassword = null;
        function createOrUpdateUser() {
            if (AppState.model.currentUser) {
                return User.update({
                    'id': AppState.model.currentUser.id,
                    'email': $scope.newUser.email,
                    'first_name': $scope.newUser.first_name,
                    'last_name': $scope.newUser.last_name
                }).$promise.then(function(user) {
                    if (!oldPassword) {
                        $scope.newUser.password = "";
                        $scope.newUser.repeated_password = "";
                    } else {
                        return User.update_password({
                            'id': AppState.model.currentUser.id,
                            'password': $scope.newUser.password,
                            'old_password': oldPassword
                        }).$promise;
                    }
                }).then(function() {
                    // record the last known password in case the user goes back to edit it
                    oldPassword = $scope.newUser.password;
                });
            } else {
                return Setup.create_user({
                    'token': MetabaseSettings.get('setup_token'),
                    'email': $scope.newUser.email,
                    'first_name': $scope.newUser.first_name,
                    'last_name': $scope.newUser.last_name,
                    'password': $scope.newUser.password
                }).$promise.then(function(session) {
                    // record the last known password in case the user goes back to edit it
                    oldPassword = $scope.newUser.password;

                    // result should have a single :id value which is our new session id
                    var sessionId = session.id;

                    // we've now used the setup token for all it's worth, so lets actively purge it now
                    AppState.model.setupToken = null;

                    // TODO - this session cookie code needs to be somewhere easily reusable
                    var isSecure = ($location.protocol() === "https") ? true : false;
                    ipCookie('metabase.SESSION_ID', sessionId, {
                        path: '/',
                        expires: 14,
                        secure: isSecure
                    });

                    // send a login notification event
                    $scope.$emit('appstate:login', sessionId);

                    // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
                    return $timeout(function(){}, 1000);
                });
            }
        }

        function setSiteName() {
            return Settings.put({
                'key': 'site-name',
                'value': $scope.newUser.siteName
            }).$promise.then(function(success) {
                // anything we need to do here?
            });
        }

        $scope.createUser = function() {
            $scope.$broadcast("form:reset");

            // start off by creating the first user of the system
            // NOTE: this should both create the user AND log us in and return a session id
            createOrUpdateUser().then(function() {
                // now that we should be logged in and our session cookie is established, lets do the rest of the work
                return setSiteName();
            }).then(function() {
                // we should be good to carry on with setting up data at this point
                $scope.completedSteps.user = true;
                $scope.userStepText = 'Welcome ' + AppState.model.currentUser.first_name + ', nice to meet you!';
            }).catch(function(error) {
                $scope.$broadcast("form:api-error", error);
            });
        };

        $scope.skipDatabase = function() {
            $scope.completedSteps.database = true;
            $scope.databaseStepText = 'I\'ll add my own data later';
        };

        $scope.isStep = function(step) {
            switch (step) {
                case 'welcome':  return $scope.completedSteps.welcome;
                case 'user':     return ($scope.completedSteps.welcome && !$scope.completedSteps.user);
                case 'database': return ($scope.completedSteps.user && !$scope.completedSteps.database);
                case 'usage':    return ($scope.completedSteps.database && !$scope.completedSteps.usage);
            }
        };
    }
]);
