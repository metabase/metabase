angular
.module('metabase.admin.datamodel', [
    'metabase.admin.datamodel.controllers'
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

    $routeProvider.when('/admin/datamodel/database', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', metadataRoute);
}]);
