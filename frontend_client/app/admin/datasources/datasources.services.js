'use strict';

// Query Services
var DataSourceServices = angular.module('corvusadmin.datasources.services', ['ngResource', 'ngCookies']);
DataSourceServices.factory('DataSource', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/datasource/source/:dataSourceId', {}, {
        list: {
            url:'/api/datasource/source?org=:orgId',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/datasource/source',
            method:'POST',
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        creation_information:{
            url:'/api/datasource/source/creation_information/',
            method:'GET',
        },

        get: {
            method:'GET',
            params:{dataSourceId:'@dataSourceId'}
        },
        update: {
            method:'PUT',
            params:{dataSourceId:'@id'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        delete: {
            method:'DELETE',
            params:{dataSourceId:'@dataSourceId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        ingest: {
            method:'POST',
            url:'/api/datasource/source/:dataSourceId/ingest',
            params:{dataSourceId:'@dataSourceId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },
        reingest: {
            method:'POST',
            url:'/api/datasource/source/:dataSourceId/reingest',
            params:{dataSourceId:'@dataSourceId'},
            headers: {'X-CSRFToken': function() { return $cookies.csrftoken; }},
        },        
        ingestions: {
            url:'/api/datasource/source/:dataSourceId/ingestions?page=:pageNumber',
            method:'GET',
            params:{dataSourceId:'@dataSourceId'},
            isArray:true
        }
    });
}]);

DataSourceServices.factory('DataSourceIngestion', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/datasource/ingestion/:dataSourceIngestionId', {}, {
        list: {
            url:'/api/datasource/ingestion?org=:orgId',
            method:'GET',
            isArray:true
        },
        get: {
            method:'GET',
            params:{dataSourceIngestionId:'@dataSourceIngestionId'}
        },
        log: {
            url:'/api/datasource/ingestion/:dataSourceIngestionId/log',
            method:'GET',
            params:{dataSourceId:'@dataSourceId'},
        }

    });
}]);

DataSourceServices.service('SourceTypeHelpers', [function(){
    // Timestamped Datasources -- thanks @ded
    this.checkTimestampedDataSource = function(source_type) {
        return !!~['db_snap', 'log', 'xls', 'csv'].indexOf(source_type);
    };
}]);
