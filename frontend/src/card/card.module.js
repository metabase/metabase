// Card
var Card = angular.module('metabase.card', [
    'ngRoute',
    'ngCookies',
    'metabase.filters',
    'metabase.directives',
    'metabase.services',
    'metabase.card.controllers',
    'metabase.card.directives'
]);

Card.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/q', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/q/:serializedCard', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/card/:cardId', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/card/:cardId/:serializedCard', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });

    $routeProvider.when('/card/', {
        template:   '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: 'CardList',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });
}]);
