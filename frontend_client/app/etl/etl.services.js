'use strict';

// ETL Services
var ETLServices = angular.module('corvus.etl.services', ['ngResource']);

ETLServices.factory('ETL', ['$resource', function($resource, $cookies) {
    return $resource('/api/etl', {}, {
        db_status: {
            url:'/api/etl/',
            method:'GET'
        },
        ingestion_list: {
            url:'/api/etl/ingestions/:type/:dbId',
            method:'GET',
            params:{type:'@type', dbId:'@dbId'},
            isArray:true
        }
    });
}]);
