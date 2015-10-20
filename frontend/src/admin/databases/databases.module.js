var AdminDatabases = angular.module('metabaseadmin.databases', [
    'metabaseadmin.databases.controllers'
]);

AdminDatabases.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/databases', {
        template: '<div class="flex flex-column flex-full" mb-react-component="DatabaseList"></div>',
        controller: 'DatabaseList'
    });
    $routeProvider.when('/admin/databases/create', {
        templateUrl: '/app/admin/databases/partials/database_edit.html',
        controller: 'DatabaseEdit'
    });
    $routeProvider.when('/admin/databases/:databaseId', {
        templateUrl: '/app/admin/databases/partials/database_edit.html',
        controller: 'DatabaseEdit'
    });
}]);
