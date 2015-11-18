angular
.module('metabase.admin.metadata', [
    'metabase.admin.metadata.controllers'
])
.config(['$routeProvider', function ($routeProvider) {
    var metadataRoute = {
        template: '<div class="flex flex-column flex-full" mb-react-component="MetadataEditor"></div>',
        controller: 'MetadataEditor',
        resolve: {
            databases: ['Metabase', function(Metabase) {
                return Metabase.db_list().$promise
            }]
        }
    };

    $routeProvider.when('/admin/metadata', metadataRoute);
    $routeProvider.when('/admin/metadata/:databaseId', metadataRoute);
    $routeProvider.when('/admin/metadata/:databaseId/:mode', metadataRoute);
    $routeProvider.when('/admin/metadata/:databaseId/:mode/:tableId', metadataRoute);
}]);
