
import "metabase/filters";
import "metabase/directives";
import "metabase/services";
import "./card.controllers";

const CARD_DETAIL_TEMPLATE =
`<div class="QueryBuilder flex flex-column bg-white spread" ng-class="{ 'QueryBuilder--showDataReference': isShowingDataReference }">
    <div id="react_qb_header"></div>
    <div id="react_qb_editor" class="z2"></div>
    <div id="react_qb_viz" class="flex z1"></div>
</div>
<div class="DataReference" id="react_data_reference"></div>
<div id="react_qb_tutorial"></div>
<div id="react_qbnewb_modal"></div>`;

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
        template: CARD_DETAIL_TEMPLATE,
        controller: 'CardDetail'
    });
    $routeProvider.when('/card/:cardId', {
        template: CARD_DETAIL_TEMPLATE,
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
