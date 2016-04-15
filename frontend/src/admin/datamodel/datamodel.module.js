import "./datamodel.controllers";

angular
.module('metabase.admin.datamodel', [
    'metabase.admin.datamodel.controllers'
])
.config(['$routeProvider', function ($routeProvider) {
    var metadataRoute = {
        template: '<div class="full-height spread" mb-react-component="MetadataEditor"></div>',
        controller: 'MetadataEditor',
        resolve: {
            databases: ['Metabase', function(Metabase) {
                return Metabase.db_list().$promise
            }]
        }
    };

    $routeProvider.when('/admin/datamodel/database/:databaseId/virtualtable', {
        template:   '<div mb-redux-component class="flex" style="flex-grow:1;" />',
        controller: 'VirtualTable',
        resolve: {
            database: ['$route', 'Metabase', function($route, Metabase) {
                return Metabase.db_get({dbId: parseInt($route.current.params.databaseId)}).$promise
            }]
        }
    });

    $routeProvider.when('/admin/datamodel/database', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', metadataRoute);
}]);
