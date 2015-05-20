'use strict';

var SetupControllers = angular.module('corvus.setup.controllers', ['corvus.metabase.services', 'corvus.setup.services']);

SetupControllers.controller('SetupInfo', ['$scope', '$routeParams', '$location', '$timeout', 'ipCookie', 'Organization', 'AppState', 'Setup', 'Metabase', 'CorvusCore',
    function($scope, $routeParams, $location, $timeout, ipCookie, Organization, AppState, Setup, Metabase, CorvusCore) {

        $scope.activeStep = "user";
        $scope.completedSteps = {
            user: false,
            database: false
        };

        $scope.$on("database:created", function(event, database) {
            $timeout(function() {
                $scope.activeStep = "finish";
                $scope.completedSteps.database = true;
            });
        });

        $scope.createOrgAndUser = function() {
            var name = $scope.newUser.name.split(' ')
            var firstName = name[0];
            var lastName = name[1];
            debugger;
            // start off by creating the first user of the system
            // NOTE: this should both create the user AND log us in and return a session id
            Setup.create_user({
                'token': AppState.model.setupToken,
                'email': $scope.newUser.email,
                'first_name': firstName,
                'last_name': lastName,
                'password': $scope.newUser.password
            }, function(result) {
                // result should have a single :id value which is our new session id
                var sessionId = result.id;

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
                $timeout(function() {
                    // now that we should be logged in and our session cookie is established, lets do the rest of the work

                    // create our first Organization
                    // TODO - we need some logic to slugify the name specified.  can't have spaces, caps, etc.
                    Organization.create({
                        'name': $scope.userOrgName,
                        'slug': $scope.userOrgName
                    }, function(org) {
                        console.log('first org created', org);

                        // switch the org
                        // TODO - make sure this is up to snuff from a security standpoint
                        AppState.switchOrg(org.slug);

                        // we should be good to carry on with setting up data at this point
                        // $location.path('/setup/data/');
                        $scope.activeStep = "database";
                        $scope.completedSteps.user = true;

                    }, function(error) {
                        $scope.error = error.data;
                        console.log('error creating organization', error);
                    });
                }, 300);
            }, function(error) {
                $scope.error = error.data;
                console.log('error with initial user creation', error);
            });
        };
    }
]);
