// Card
var Card = angular.module('metabase.card', [
    'ngRoute',
    'ngCookies',
    'metabase.filters',
    'metabase.directives',
    'metabase.services',
    'metabase.card.controllers'
]);

Card.config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/q', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });
    $routeProvider.when('/card/:cardId', {
        templateUrl: '/app/card/partials/card_detail.html',
        controller: 'CardDetail'
    });

    // redirect old urls to new ones with hashes
    $routeProvider.when('/q/:serializedCard', {
        redirectTo: function (routeParams, path, search) {
            return "/q#"+routeParams.serializedCard;
        }
    });
    $routeProvider.when('/card/:cardId/:serializedCard', {
        redirectTo: function (routeParams, path, search) {
            return "/card/"+routeParams.cardId+"#"+routeParams.serializedCard;
        }
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
