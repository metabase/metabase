var Setup = angular.module('corvus.setup', [
    'corvus.setup.controllers',
    'corvus.setup.directives'
]);

Setup.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/setup/data', {
        templateUrl: '/app/setup/partials/setup_data.html',
        controller: 'SetupData'
    });

    $routeProvider.when('/setup/data/add', {
        templateUrl: '/app/setup/partials/setup_connection.html',
        controller: 'SetupConnection'
    });

    $routeProvider.when('/setup/data/:dbId', {
        templateUrl: '/app/setup/partials/setup_connection.html',
        controller: 'SetupConnection'
    });
}]);
