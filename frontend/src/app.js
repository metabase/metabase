// Declare app level module which depends on filters, and services
var Metabase = angular.module('metabase', [
    'ngRoute',
    'ngCookies',
    'ui.bootstrap', // bootstrap LIKE widgets via angular directives
    'metabase.auth',
    'metabase.filters',
    'metabase.directives',
    'metabase.controllers',
    'metabase.components',
    'metabase.card',
    'metabase.dashboard',
    'metabase.home',
    'metabase.pulse',
    'metabase.setup',
    'metabase.user',
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

Metabase.run(["AppState", function(AppState) {
    // initialize app state
    AppState.init();

    document.body.ondragover = function () {
        this.className = "drophover";
        return false;
    };
    document.body.ondragleave =
    document.body.ondragend = function () {
        this.className = "";
        return false;
    };
    document.body.ondrop = function (e) {
        this.className = "";
        e.preventDefault();

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload/upload_table');
        xhr.onload = function() {
            let result = JSON.parse(xhr.responseText);
            window.location = "/q?db=" + result.db + "&table=" + result.table;
        };
        xhr.send(e.dataTransfer.files[0]);
    }
}]);
