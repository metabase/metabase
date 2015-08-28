'use strict';
/*jslint browser:true*/

// Declare app level module which depends on filters, and services
var Metabase = angular.module('metabase', [
    'ngAnimate',
    'ngRoute',
    'ngCookies',
    'ngSanitize',
    'xeditable', // inplace editing capabilities
    'ui.bootstrap', // bootstrap LIKE widgets via angular directives
    'gridster', // used for dashboard grids
    'readableTime',
    'metabase.auth',
    'metabase.filters',
    'metabase.directives',
    'metabase.controllers',
    'metabase.components',
    'metabase.card',
    'metabase.dashboard',
    'metabase.explore',
    'metabase.home',
    'metabase.user',
    'metabase.setup',
    'metabaseadmin.databases',
    'metabaseadmin.people',
    'metabaseadmin.settings',
    'metabase.admin.metadata',
]);
Metabase.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    $routeProvider.when('/unauthorized/', {
        templateUrl: '/app/unauthorized.html',
        controller: 'Unauthorized'
    });

    $routeProvider.when('/auth/', {
        redirectTo: function(routeParams, path, search) {
            return '/auth/login';
        }
    });

    $routeProvider.when('/admin/', {
        redirectTo: function(routeParams, path, search) {
            return '/admin/settings';
        }
    });

    // TODO: we need an appropriate homepage or something to show in this situation
    $routeProvider.otherwise({
        templateUrl: '/app/not_found.html',
        controller: 'NotFound'
    });
}]);

Metabase.run(["AppState", "editableOptions", "editableThemes", function(AppState, editableOptions, editableThemes) {
    // initialize app state
    AppState.init();

    // set `default` theme
    editableOptions.theme = 'default';

    // overwrite submit button template
    editableThemes['default'].submitTpl = '<button class="Button Button--primary" type="submit">Save</button>';
    editableThemes['default'].cancelTpl = '<button class="Button" ng-click="$form.$cancel()">cancel</button>';
}]);
