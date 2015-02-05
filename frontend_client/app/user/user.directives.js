"use strict";

var AdminUserDirectives = angular.module('corvus.user.directives', []);


AdminUserDirectives.directive('passwordVerify', function() {
    function link(scope, element, attrs, ctrl) {
        scope.$watch(function() {
            var combined;
            if (scope.passwordVerify || ctrl.$viewValue) {
                combined = scope.passwordVerify + '_' + ctrl.$viewValue;
            }
            return combined;
        }, function(value) {
            if (value) {
                ctrl.$parsers.unshift(function(viewValue) {
                    var origin = scope.passwordVerify;
                    if (origin !== viewValue) {
                        ctrl.$setValidity("password_verify", false);
                        return undefined;
                    } else {
                        ctrl.$setValidity("password_verify", true);
                        return viewValue;
                    }
                });
            }
        });
    }

    return {
        require: 'ngModel',
        scope: {
            passwordVerify: '='
        },
        link: link
    };
});
