'use strict';

var Operator = angular.module('corvus.operator', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.metabase.services',
    'corvus.operator.controllers',
    'corvus.operator.services'
]);

Operator.config(['$routeProvider', function ($routeProvider) {
    $routeProvider.when('/:orgSlug/specialist/:specialistId', {templateUrl: '/app/operator/partials/specialist_detail.html', controller: 'SpecialistDetail'});
    $routeProvider.when('/:orgSlug/specialist/', {templateUrl: '/app/operator/partials/specialist_list.html', controller: 'SpecialistList'});
    $routeProvider.when('/:orgSlug/conversation/:conversationId', {templateUrl: '/app/operator/partials/conversation_detail.html', controller: 'ConversationDetail'});
}]);
