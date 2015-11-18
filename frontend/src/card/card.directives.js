/*global setTimeout */

var CardDirectives = angular.module('metabase.card.directives', []);

CardDirectives.directive('mbCardFavoriteButton', ['Card', function(Card) {

    function link(scope, element, attr) {
        scope.favorite = false;

        scope.$watch('cardId', function(value) {
            if (value) {
                initialize();
            }
        });

        var initialize = function() {
            // initialize the current favorite status
            Card.isfavorite({
                'cardId': scope.cardId
            }, function(result) {
                if (result && !result.error) {
                    if (result.favorite === true) {
                        scope.favorite = true;
                    }
                } else {
                    console.log(result);
                }
            });
        };

        scope.toggleFavorite = function() {

            if (scope.favorite) {
                // already favorited, lets unfavorite
                Card.unfavorite({
                    'cardId': scope.cardId
                }, function(result) {
                    if (result && !result.error) {
                        scope.favorite = false;
                    }
                });
            } else {
                // currently not favorited, lets favorite
                Card.favorite({
                    'cardId': scope.cardId
                }, function(result) {
                    if (result && !result.error) {
                        scope.favorite = true;
                    }
                });
            }
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/card/partials/_card_favorite.html',
        scope: {
            cardId: '='
        },
        link: link
    };
}]);
