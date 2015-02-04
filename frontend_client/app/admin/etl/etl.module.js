'use strict';

var ETL = angular.module('corvusadmin.etl', [
    'corvusadmin.etl.controllers',
    'corvusadmin.etl.services'
]);

ETL.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/etl/jobexec/', {templateUrl: '/app/admin/etl/partials/etl_jobexec_list.html', controller: 'EtlJobexecList'});
    $routeProvider.when('/:orgSlug/admin/etl/job/', {templateUrl: '/app/admin/etl/partials/etl_job_list.html', controller: 'EtlJobList'});
    $routeProvider.when('/:orgSlug/admin/etl/job/create', {templateUrl: '/app/admin/etl/partials/etl_job_detail.html', controller: 'EtlJobDetail'});
    $routeProvider.when('/:orgSlug/admin/etl/job/:jobId', {templateUrl: '/app/admin/etl/partials/etl_job_detail.html', controller: 'EtlJobDetail'});
    $routeProvider.otherwise({redirectTo: '/:orgSlug/admin/'});
}]);
