var SetupApp = angular.module('corvussetup', [
    'ngAnimate',
    'ngRoute',
    'ngCookies',
    'ngSanitize',
    'xeditable', // inplace editing capabilities
    'angularytics', // google analytics
    'ui.bootstrap', // bootstrap LIKE widgets via angular directives
    'ui.sortable',
    'corvus.filters',
    'corvus.directives',
    'corvus.controllers',
    'corvus.components',
    'corvussetup.controllers',
    'corvussetup.directives'
]);

SetupApp.config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    $routeProvider.when('/setup/', {
        templateUrl: '/app/setup/setup_intro.html',
        controller: 'SetupIntro'
    });

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

SetupApp.run(function (AppState) {
    AppState.init();
})
