var Setup = angular.module('corvus.setup', [
    'corvus.setup.controllers',
    'corvus.setup.directives'
])

Setup.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/setup/data', {
        templateUrl: '/app/setup/setup_data.html',
        controller: 'SetupData'
    });

    $routeProvider.when('/setup/data/add', {
        templateUrl: '/app/setup/setup_connection.html',
        controller: 'SetupConnection'
    });

    $routeProvider.when('/setup/data/:dbId', {
        templateUrl: '/app/setup/setup_connection.html',
        controller: 'SetupConnection'
    });

    $routeProvider.when('/setup/ingestion', {
        templateUrl: '/app/setup/setup_ingestion.html',
        controller: 'SetupIngestion'
    });

    $routeProvider.when('/setup/entities', {
        templateUrl: '/app/setup/setup_entities.html',
        controller: 'SetupEntities'
    });
    $routeProvider.when('/setup/profile', {
        templateUrl: '/app/setup/setup_profile.html',
        controller: 'SetupProfile'
    });
    $routeProvider.when('/setup/team', {
        templateUrl: '/app/setup/setup_team.html',
        controller: 'SetupTeam'
    });
}])
/*
*/
