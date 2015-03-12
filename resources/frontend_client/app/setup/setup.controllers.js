var SetupControllers = angular.module('corvus.setup.controllers', ['corvus.metabase.services'])

SetupControllers.controller('SetupNav', ['$scope', function ($scope) {
    $scope.$on('setup:orgCreated', function () {
        $scope.showNav = true
    })
}])


SetupControllers.controller('SetupIntro', ['$scope', '$location', 'Organization', 'AppState', function ($scope, $location, Organization, AppState) {
    window.scope = $scope
    $scope.setOrgName = function (name) {
        // Create an organization
        org = Organization.create({'name': name, 'slug': name}, function(result){
            console.log('result', result)
            // switch the org
            // TODO - make sure this is up to snuff from a security standpoint
            AppState.switchOrg(result.slug)
            // now set the user to be a memeber of the org so we can use the current org
            Organization.member_create({'orgId': result.id, email: $scope.user.email, first_name: 'lerp', last_name: 'derperson', admin: true}, function (result) {
                console.log('result', result)
                $location.path('/setup/data/');
            }, function (error) {
                console.log('error', error)
            })
        }, function(error){
            console.log(error);
        })
    }
}]);

SetupControllers.controller('SetupConnection', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

        var defaultPorts = {'MySql': 3306, 'Postgres': 5432, 'Mongo': 27017, "RedShift": 5439, 'Druid': 8083}

        var connectionEngines = {
            'Postgres': "postgres",
        }

        $scope.engines = [
            'Postgres'
        ]

        $scope.connection = {}

        // assume we have a new connection since this is the setup process
        var newConnection = true
        $scope.breadcrumb = 'Add connection'

        if($routeParams.dbId) {
            newConnection = false
            Metabase.db_get({
                'dbId': $routeParams.dbId
            }, function (result) {
                $scope.database = result;
                $scope.breadcrumb = result.name
                $scope.connection = parseConnectionString(result.details.conn_str)
                $scope.connection.engine = result.engine
            }, function (error) {
                console.log('error', error)
            })
        } else {
            var connectionType = 'Postgres'
            $scope.connection = {
                host: "localhost",
                port: defaultPorts[connectionType],
            }
        }

        function parseConnectionString (connectionString) {
            // connection strings take the form of
            // 'host="<value>" post="<value" dbname="<value>" user="<value>" password="<value>"'

            var parsedConnection = {}
            var string = connectionString.split(" ")

            for(var s in string) {
                var connectionDetail = string[s].split("=")
                parsedConnection[connectionDetail[0]] = connectionDetail[1]
            }

            return parsedConnection
        }

        function buildConnectionString (values) {
            // connection strings take the form of
            // 'host="<value>" post="<value" dbname="<value>" user="<value>" password="<value>"'

            var connectionStringElements = ['host', 'port', 'dbname', 'user', 'password'],
                conn_str = ''

            for(var element in connectionStringElements) {
                conn_str = conn_str + ' ' + connectionStringElements[element] + '=' + values[connectionStringElements[element]]
            }

            return conn_str
        }

        $scope.setConnectionEngine = function (engine) {
            $scope.connection.engine = engine
        }

        $scope.submit = function () {
            var database = {
                org: $scope.currentOrg.id,
                name: $scope.connection.dbname,
                engine: $scope.connection.engine,
                details: {
                    conn_str: buildConnectionString($scope.connection)
                }
            };

            function success (result) {
                $location.path('/setup/data')
            }

            function error (error) {
                console.log('error', error)
            }

            if(newConnection) {
                Metabase.db_create(database, success, error);
            } else {
                // add the id since we're updating
                database.id = $scope.database.id
                Metabase.db_update(database, success, error);
            }
        }
}])

SetupControllers.controller('SetupData', ['$scope', 'Metabase', function ($scope, Metabase) {
    $scope.$watch('currentOrg', function (org) {
        Metabase.db_list({
            'orgId': org.id
            },
            function (result) {
                $scope.databases = result
            },
            function (error) {
                console.log('error', error)
            }
        )
    })
}])

SetupControllers.controller('SetupProfile', ['$scope', '$location', 'Organization', function ($scope, $location, Organization) {
    var newUser = {}

    $scope.createAdmin = function (newUser) {
        console.log(newUser)
        if(newUser.password != newUser.repeated_password){
            $scope.errors = "Passwords don't match";
        } else{
            Organization.admin_create({'orgId': $scope.setupState.currentOrg.id, 'first_name': newUser.firstName, 'last_name':newUser.lastName, 'email': newUser.email, 'password':newUser.password}, function(result){
            $scope.adminCreated = true;
            $location.path('/setup/team');

            },function(error){
                $scope.errors = error;
            });
        }

    }

}]);

SetupControllers.controller('SetupTeam', ['$scope', '$location', 'Organization', function ($scope, $location, Organization) {
    $scope.$watch('currentOrg', function(org) {
        Organization.members({
            'orgId': org.id
        }, function (result) {
            $scope.users = result
        }, function (error) {
            console.log('error', error)
        })
    })

    $scope.addInvitee = function (email) {
        Organization.member_create({
            'orgId': $scope.currentOrg.id,
            'email': email
        },
        function(result){
            listUsers($scope.setupState.org.id)
        },
        function(error){
            console.log(error)
        }
    );
    }
}]);
