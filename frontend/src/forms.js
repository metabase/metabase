/* Services */

var MetabaseForms = angular.module('metabase.forms', ['metabase.directives']);

MetabaseForms.directive('mbFormField', [function () {

    return {
        restrict: 'A',
        scope: {},
        link: function(scope, element, attr) {
            var fieldName = attr.mbFormField;

            scope.$on("form:api-error", function (event, httpErrors) {
                if (httpErrors.data.errors && fieldName in httpErrors.data.errors) {
                    element.addClass('Form--fieldError');
                }
            });

            scope.$on("form:reset", function (event) {
                element.removeClass('Form--fieldError');
            });
        }
    };
}]);

MetabaseForms.directive('mbFormLabel', [function () {

    return {
        restrict: 'E',
        replace: true,
        template: '<label class="Form-label Form-offset">{{name}}: <span ng-show="message">{{message}}</span></label>',
        scope: {
            name: '@displayName'
        },
        link: function(scope, element, attr) {
            var fieldName = attr.fieldName;
            scope.message = undefined;

            scope.$on("form:api-error", function (event, httpErrors) {
                if (httpErrors.data.errors && fieldName in httpErrors.data.errors) {
                    scope.message = httpErrors.data.errors[fieldName];
                }
            });

            scope.$on("form:reset", function (event) {
                scope.message = undefined;
            });
        }
    };
}]);

MetabaseForms.directive('mbFormMessage', [function () {

    return {
        restrict: 'E',
        replace: true,
        template: '<span class="px2" ng-class="{\'text-success\': error === false, \'text-error\': error === true}" ng-show="visible" mb-delayed-call="reset()">{{message}}</span>',
        scope: {},
        link: function(scope, element, attr) {

            var setMessage = function (msg, isError) {
                scope.visible = true;
                scope.message = msg;
                scope.error = isError;
            };

            scope.reset = function() {
                scope.visible = false;
                scope.message = undefined;
                scope.error = undefined;
            };

            // notification of api error
            scope.$on("form:api-error", function (event, httpErrors) {
                if (httpErrors.data.message) {
                    setMessage(httpErrors.data.message, true);

                } else if (httpErrors.status === 500) {
                    // generic 500 without a specific message
                    setMessage("Server error encountered", true);
                }

            });

            // notification of api success
            scope.$on("form:api-success", function (event, message) {
                setMessage(message, false);
            });

            // notification of form state reset
            scope.$on("form:reset", function (event) {
                scope.reset();
            });

            // start from base state
            scope.reset();
        }
    };
}]);

MetabaseForms.directive('autofocus', ['$timeout', function($timeout) {
  return {
    restrict: 'A',
    link : function($scope, $element) {
      $timeout(function() {
        $element[0].focus();
      });
    }
  };
}]);
