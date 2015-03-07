'use strict';
/*jslint browser:true*/

// Declare app level module which depends on filters, and services
var SuperAdmin = angular.module('superadmin', [
    'ngAnimate',
    'ngRoute',
    'ngCookies',
    'ngSanitize',
    'xeditable',              // inplace editing capabilities
    'angularytics',           // google analytics
    'ui.bootstrap',           // bootstrap LIKE widgets via angular directives
    'gridster',               // used for dashboard grids
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.components',
    'superadmin.controllers',
    'superadmin.index',
    'superadmin.datamarts'
]);

SuperAdmin.config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
    $routeProvider.otherwise({redirectTo: '/superadmin/'});
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });
}]);

SuperAdmin.run(function(editableOptions, editableThemes) {
    // set `default` theme
    editableOptions.theme = 'default';

    // overwrite submit button template
    editableThemes['default'].submitTpl = '<button class="Button Button--primary" type="submit">Save</button>';
    editableThemes['default'].cancelTpl = '<button class="Button" ng-click="$form.$cancel()">cancel</button>';
});


if (document.location.hostname != "localhost") {
    // Only set up logging in production
    SuperAdmin.config(function(AngularyticsProvider) {
        AngularyticsProvider.setEventHandlers(['Console', 'GoogleUniversal']);
    }).run(function(Angularytics) {
        Angularytics.init();
    });
}
