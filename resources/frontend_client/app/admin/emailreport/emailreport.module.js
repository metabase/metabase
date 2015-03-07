'use strict';

var EmailReport = angular.module('corvusadmin.emailreport', [
    'corvusadmin.emailreport.controllers',
    'corvusadmin.emailreport.services'
]);

EmailReport.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/admin/emailreport/', {templateUrl: '/app/admin/emailreport/partials/emailreport_list.html', controller: 'EmailReportList'});
    $routeProvider.when('/:orgSlug/admin/emailreport/create', {templateUrl: '/app/admin/emailreport/partials/emailreport_detail.html', controller: 'EmailReportDetail'});
    $routeProvider.when('/:orgSlug/admin/emailreport/executions/', {templateUrl: '/app/admin/emailreport/partials/emailreportexec_list.html', controller: 'EmailReportExecList'});
    $routeProvider.when('/:orgSlug/admin/emailreport/:reportId', {templateUrl: '/app/admin/emailreport/partials/emailreport_detail.html', controller: 'EmailReportDetail'});
}]);
