'use strict';

var SetupControllers = angular.module('corvus.setup.controllers', ['corvus.metabase.services', 'corvus.setup.services']);

SetupControllers.controller('SetupInit', ['$scope', '$location', '$routeParams', 'AppState',
    function($scope, $location, $routeParams, AppState) {

        // The only thing this controller does is grab the setup token from the url and store it in our AppState
        // then we begin the actual setup workflow by sending the user to /setup/

        AppState.model.setupToken = $routeParams.setupToken;

        $location.path('/setup/welcome');
    }
]);

SetupControllers.controller('SetupInfo', ['$scope', '$routeParams', '$location', '$timeout', 'ipCookie', 'Organization', 'User', 'AppState', 'Setup', 'Metabase', 'CorvusCore',
    function($scope, $routeParams, $location, $timeout, ipCookie, Organization, User, AppState, Setup, Metabase, CorvusCore) {
        $scope.activeStep = "user";
        $scope.completedSteps = {
            user: false,
            database: false
        };

        if (AppState.model.currentUser) {
            $location.path('/');
        }

        $scope.newUser = {};



        $scope.$on("database:created", function(event, database) {
            $timeout(function() {
                $scope.activeStep = "finish";
                $scope.completedSteps.database = true;
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
                    'token': AppState.model.setupToken,
                    'email': $scope.newUser.email,
                    'first_name': $scope.newUser.first_name,
                    'last_name': $scope.newUser.last_name,
                    'password': $scope.newUser.password
                }).$promise.then(function(user) {
                    console.log('first user created', user);

                    // record the last known password in case the user goes back to edit it
                    oldPassword = $scope.newUser.password;

                    // result should have a single :id value which is our new session id
                    var sessionId = user.id;

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

        function createOrUpdateOrg() {
            // TODO - we need some logic to slugify the name specified.  can't have spaces, caps, etc.
            if (AppState.model.currentOrg) {
                return Organization.update({
                    'id': AppState.model.currentOrg.id,
                    'name': $scope.newUser.orgName,
                    'slug': $scope.newUser.orgName
                }).$promise;
            } else {
                return Organization.create({
                    'name': $scope.newUser.orgName,
                    'slug': $scope.newUser.orgName
                }).$promise.then(function(org) {
                    console.log('first org created', org);

                    // switch the org
                    // TODO - make sure this is up to snuff from a security standpoint
                    AppState.switchOrg(org.slug);
                });
            }
        }

        $scope.createOrgAndUser = function() {
            // start off by creating the first user of the system
            // NOTE: this should both create the user AND log us in and return a session id
            createOrUpdateUser().then(function() {
                // now that we should be logged in and our session cookie is established, lets do the rest of the work
                // create our first Organization
                return createOrUpdateOrg();
            }).then(function() {
                // reset error in case there were previous errors
                $scope.error = null;

                // we should be good to carry on with setting up data at this point
                $scope.activeStep = "database";
                $scope.completedSteps.user = true;
            }).catch(function(error) {
                console.log('error with initial', error);
                $scope.error = error.data;
            });
        };
    }
]);
