'use strict';
/*jslint browser:true*/

// Declare app level module which depends on filters, and services
var Corvus = angular.module('corvus', [
    'ngAnimate',
    'ngRoute',
    'ngCookies',
    'ngSanitize',
    'xeditable', // inplace editing capabilities
    'angularytics', // google analytics
    'ui.bootstrap', // bootstrap LIKE widgets via angular directives
    'gridster', // used for dashboard grids
    'ui.sortable',
    'readableTime',
    'corvus.auth',
    'corvus.filters',
    'corvus.directives',
    'corvus.controllers',
    'corvus.components',
    'corvus.card',
    'corvus.dashboard',
    'corvus.explore',
    'corvus.operator', // this is a short term hack
    'corvus.reserve',
    'corvus.search',
    'corvus.user',
    'corvus.setup',
    'corvusadmin.index.controllers',
    'corvusadmin.databases',
    'corvusadmin.datasets',
    'corvusadmin.emailreport',
    'corvusadmin.people',
    'corvusadmin.query',
    'corvusadmin.annotation',
    'corvusadmin.search',
    'superadmin.index',
    'superadmin.organization'
]);
Corvus.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    $routeProvider.when('/', {
        template: '',
        controller: 'Homepage'
    });

    $routeProvider.when('/unauthorized/', {
        templateUrl: '/app/unauthorized.html',
        controller: 'Unauthorized'
    });

    $routeProvider.when('/setup/', {
        templateUrl: '/app/setup/partials/setup_intro.html',
        controller: 'SetupIntro'
    });

    $routeProvider.when('/setup/init/:setupToken', {
        template: '',
        controller: 'SetupInit'
    });

    // TODO: we need actual homepages for orgs!
    $routeProvider.when('/:orgSlug/', {
        redirectTo: function(routeParams, path, search) {
            return '/' + routeParams.orgSlug + '/dash/';
        }
    });

    // admin routes
    $routeProvider.when('/:orgSlug/admin/', {
        templateUrl: '/app/admin/home.html',
        controller: 'AdminHome'
    });

    $routeProvider.when('/:orgSlug/admin/test_login_form', {
        templateUrl: '/app/admin/test_login_form.html',
        controller: 'TestLoginForm'
    });

    // TODO: we need an appropriate homepage or something to show in this situation
    $routeProvider.otherwise({
        redirectTo: '/user/edit_current'
    });
}]);

Corvus.run(function(AppState, editableOptions, editableThemes) {
    // initialize app state
    AppState.init();

    // set `default` theme
    editableOptions.theme = 'default';

    // overwrite submit button template
    editableThemes['default'].submitTpl = '<button class="Button Button--primary" type="submit">Save</button>';
    editableThemes['default'].cancelTpl = '<button class="Button" ng-click="$form.$cancel()">cancel</button>';
});


if (document.location.hostname != "localhost") {
    // Only set up logging in production
    Corvus.config(function(AngularyticsProvider) {
        AngularyticsProvider.setEventHandlers(['Console', 'GoogleUniversal']);
    }).run(function(Angularytics) {
        Angularytics.init();
    });
}
