var AdminDatabases = angular.module('metabase.admin.databases', [
    'metabase.admin.databases.controllers'
]);

AdminDatabases.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/databases', {
        template: '<div class="flex flex-column flex-full" mb-react-component="DatabaseList"></div>',
        controller: 'DatabaseList'
    });
    $routeProvider.when('/admin/databases/create', {
        template: '<div class="flex flex-column flex-full" mb-react-component="DatabaseEdit"></div>',
        controller: 'DatabaseEdit'
    });
    $routeProvider.when('/admin/databases/:databaseId', {
        template: '<div class="flex flex-column flex-full" mb-react-component="DatabaseEdit"></div>',
        controller: 'DatabaseEdit'
    });
}]);
