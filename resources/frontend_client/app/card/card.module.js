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
    $routeProvider.when('/card/', {
        templateUrl: '/app/card/partials/card_list.html',
        controller: 'CardList'
    });
    $routeProvider.when('/card/create/', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/card/:cardId', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
}]);
