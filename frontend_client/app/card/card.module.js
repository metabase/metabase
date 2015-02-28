'use strict';

// Card
var Card = angular.module('corvus.card', [
    'ngRoute',
    'ngCookies',
    'corvus.filters',
    'corvus.directives',
    'corvus.services',
    'corvus.aceeditor.directives',
    'corvus.card.services',
    'corvus.card.controllers',
    'corvus.card.directives'
]);

Card.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/:orgSlug/card/', {
        templateUrl: '/app/card/partials/card_list.html',
        controller: 'CardList'
    });
    $routeProvider.when('/:orgSlug/card/create/:queryId', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/:orgSlug/card/create/', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/:orgSlug/card/createnew/', {
        templateUrl: '/app/card/partials/card_detail_new.html',
        controller: 'CardDetailNew'
    });
    $routeProvider.when('/:orgSlug/card/:cardId', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/:orgSlug/cool_new_card/:cardId', {
        templateUrl: '/app/card/partials/card_detail_new.html',
        controller: 'CardDetailNew'
    });
}]);
