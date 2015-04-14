'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var MetabaseForms = angular.module('metabase.forms', []);

MetabaseForms.service('MetabaseForm', function() {

	// accepts an instance of angular form.FormController and a map of expected form fields and will simply
	// clear any of our error messages from the form instance
    this.clearFormErrors = function(form, formFields) {
    	Object.keys(formFields).forEach(function (key) {
    		form[formFields[key]].$error.message = undefined;
    	});

    	form.$error.message = undefined;
    };

    // accepts an instance of angular form.FormController, a map of expected form fields, and the http errors
    // from an $http call and will parse out any supplied error information and set it on the form
    //
    // the formFields should come as .. {'api_field_name': 'angularFormFieldName'}
    this.parseFormErrors = function(form, formFields, httpErrors) {
        if (httpErrors.data.errors) {
            // field validation error(s)
            Object.keys(httpErrors.data.errors).forEach(function (key) {
                if (formFields[key] !== 'undefined') {
                    // this simply takes the error message from our api response and
                    // applies it to the correct form field in our angular form object
                    form[formFields[key]].$error.message = httpErrors.data.errors[key];
                }

                // NOTE: if we the above conditional fails that means we got an error for a field that our form
                //       does not seem to be interested in, so we simply skip over it and do nothing
            });
        } else if (httpErrors.data.message) {
            // generic error not attributed to specific field
            form.$error.message = httpErrors.data.message;
        }
    };
});

MetabaseForms.directive('mbFormLabel', [function () {

    return {
        restrict: 'E',
        replace: true,
        template: '<label>{{displayName}}: <span ng-show="form[fieldName].$error.message">{{form[fieldName].$error.message}}</span></label>',
        scope: {
            form: '=',
            displayName: '@',
            fieldName: '@'
        }
    };
}]);
