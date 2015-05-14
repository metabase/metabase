'use strict';

var SetupControllers = angular.module('corvus.setup.controllers', ['corvus.metabase.services', 'corvus.setup.services']);

SetupControllers.controller('SetupInit', ['$scope', '$location', '$routeParams', 'AppState',
    function($scope, $location, $routeParams, AppState) {

        // The only thing this controller does is grab the setup token from the url and store it in our AppState
        // then we begin the actual setup workflow by sending the user to /setup/

        AppState.model.setupToken = $routeParams.setupToken;

        $location.path('/setup/');
    }
]);

SetupControllers.controller('SetupIntro', ['$scope', '$location', '$timeout', 'ipCookie', 'Organization', 'AppState', 'Setup',
    function($scope, $location, $timeout, ipCookie, Organization, AppState, Setup) {

        $scope.createOrgAndUser = function() {

            // start off by creating the first user of the system
            // NOTE: this should both create the user AND log us in and return a session id
            Setup.create_user({
                'token': AppState.model.setupToken,
                'email': $scope.newUser.email,
                'first_name': $scope.newUser.firstName,
                'last_name': $scope.newUser.lastName,
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
                        $location.path('/setup/data/');

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

SetupControllers.controller('SetupConnection', ['$scope', '$routeParams', '$location', 'Metabase', 'CorvusCore', function($scope, $routeParams, $location, Metabase, CorvusCore) {

    $scope.ENGINES = CorvusCore.ENGINES;

    $scope.details = {};

    // assume we have a new connection since this is the setup process
    var newConnection = true;
    $scope.breadcrumb = 'Add connection';

    // hide the SSL field when creating a new DB until we auto-infer SSL support
    $scope.hiddenFields = {
        ssl: true
    };

    if ($routeParams.dbId) {
        newConnection = false;
        $scope.hiddenFields = null;
        Metabase.db_get({
            'dbId': $routeParams.dbId
        }, function(result) {
            $scope.database = result;
            $scope.breadcrumb = result.name;
            $scope.details = $scope.ENGINES[result.engine].parseDetails(result.details);
        }, function(error) {
            console.log('error', error);
        });
    } else {
        $scope.details = {
            host: 'localhost',
            port: '5432',
            ssl: false
        };
        $scope.database = {
            engine: 'postgres',
            details: $scope.details
        };
    }

    $scope.setConnectionEngine = function(engine) {
        $scope.database.engine = engine;
    };

    // Call API to determine whether connection is valid. If so, save the DB.
    $scope.submit = function() {
        // add engine to the request body
        $scope.details.engine = $scope.database.engine;

        function validateConnectionDetails(onConnectionValidationFailed) {
            console.log('attempting to connect with SSL set to: ', $scope.details.ssl);

            Metabase.validate_connection($scope.details, function() {
                // Connection valid, save the DB
                console.log('connection successful.');

                var engine = $scope.database.engine,
                    database = {
                        org: $scope.currentOrg.id,
                        name: $scope.database.name,
                        engine: engine,
                        details: $scope.ENGINES[engine].buildDetails($scope.details)
                    };

                function onCreateOrUpdateDBSuccess(result) {
                    $location.path('/setup/data');
                }

                function onCreateOrUpdateDBError(err) {
                    $scope.error = err;
                    console.log('error', err);
                }

                if (newConnection) {
                    Metabase.db_create(database, onCreateOrUpdateDBSuccess, onCreateOrUpdateDBError);
                } else {
                    // add the id since we're updating
                    database.id = $scope.database.id;
                    Metabase.db_update(database, onCreateOrUpdateDBSuccess, onCreateOrUpdateDBError);
                }
            }, onConnectionValidationFailed);
        }

        function displayConnectionValidationError(error) {
            console.log(error);
            $scope.error = "Invalid Connection String - " + error.data.message;
        }

        // now perform the connection validation
        if (newConnection) {
            // if this is a new connection we'll try SSL first and if that fails we'll retry without it
            $scope.details.ssl = true;
            validateConnectionDetails(function(error) {
                // try again without SSL
                $scope.details.ssl = false;
                validateConnectionDetails(displayConnectionValidationError);
            });
        } else {
            validateConnectionDetails(displayConnectionValidationError);
        }
    };
}]);

SetupControllers.controller('SetupData', ['$scope', 'Metabase', function($scope, Metabase) {
    $scope.$watch('currentOrg', function(org) {
        if (!org) return;

        Metabase.db_list({
                'orgId': org.id
            },
            function(result) {
                $scope.databases = result;
            },
            function(error) {
                console.log('error', error);
            }
        );
    });
}]);