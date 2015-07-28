'use strict';
/*global require*/

angular
.module('metabase.admin.metadata', [
    'metabase.admin.metadata.controllers'
])
.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/admin/metadata/', {
        template: '<div mb-react-component="MetadataEditor"></div>',
        controller: 'MetadataEditor',
        resolve: {
            databases: ['Metabase', function(Metabase) {
                return Metabase.db_list().$promise
            }]
        }
    });
}]);
