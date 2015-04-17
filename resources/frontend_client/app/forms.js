'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var MetabaseForms = angular.module('metabase.forms', ['corvus.directives']);

MetabaseForms.service('MetabaseForm', function() {

	// accepts an instance of angular form.FormController and clears any of our error messages from the form
    this.clearFormErrors = function(form) {
    	Object.keys(form).forEach(function (key) {
            // we only care about attributes of the form which do NOT start with '$'
            if (key.indexOf('$') === -1 &&
                key in form &&
                typeof(form[key]) === 'object' &&
                form[key] !== null &&
                '$error' in form[key]) {
                form[key].$error.message = undefined;
            }
    	});

    	form.$error.message = undefined;
    };

    // accepts an instance of angular form.FormController and the http errors from an $http call
    // and will parse out any supplied error information and set it on the form
    this.parseFormErrors = function(form, httpErrors) {
        if (httpErrors.data.errors) {
            // field validation error(s)
            Object.keys(httpErrors.data.errors).forEach(function (key) {
                if (form[key] !== 'undefined') {
                    // this simply takes the error message from our api response and
                    // applies it to the correct form field in our angular form object
                    form[key].$error.message = httpErrors.data.errors[key];
                }

                // NOTE: if we the above conditional fails that means we got an error for a field that our form
                //       does not seem to be interested in, so we simply skip over it and do nothing
            });

        } else if (httpErrors.data.message) {
            // generic error not attributed to specific field
            form.$error.message = httpErrors.data.message;

        } else if (httpErrors.status === 500) {
            // generic 500 without a specific message
            form.$error.message = "Server error encountered";
        }
    };
});

MetabaseForms.directive('mbFormLabel', [function () {

    return {
        restrict: 'E',
        replace: true,
        template: '<label class="Form-label Form-offset">{{displayName}}: <span ng-show="form[fieldName].$error.message">{{form[fieldName].$error.message}}</span></label>',
        scope: {
            form: '=',
            displayName: '@',
            fieldName: '@'
        }
    };
}]);

MetabaseForms.directive('mbFormMessage', [function () {

    return {
        restrict: 'E',
        replace: true,
        template: '<span><span class="FormError" ng-show="form.$error.message">{{form.$error.message}}</span>' +
                  '<span class="FormSuccess" ng-if="form.success" cv-delayed-call="form.success = undefined">{{successMessage}}</span></span>',
        scope: {
            form: '=',
            successMessage: '@'
        }
    };
}]);
