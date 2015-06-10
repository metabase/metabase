'use strict';

/*jslint browser:true */
/*jslint devel:true */
/*global ace*/

/* Directives */
var CorvusDirectives = angular.module('corvus.directives', []);

CorvusDirectives.directive('deleteConfirm', [function() {
    return {
        priority: 1,
        terminal: true,
        link: function(scope, element, attr) {
            var msg = attr.ngConfirmClick || "Are you sure?";
            var clickAction = attr.ngClick;
            element.bind('click', function(event) {
                if (window.confirm(msg)) {
                    scope.$eval(clickAction);
                }
            });
        }
    };
}]);

CorvusDirectives.directive('cvDelayedCall', ['$timeout', function($timeout) {

    function link(scope, element, attr) {
        var delay = attr.delay;
        if (!delay) {
            delay = 8000;
        }

        var func = attr.cvDelayedCall;

        var promise = $timeout(function() {
            scope.$eval(func);
        }, delay);
    }

    return {
        restrict: 'A',
        link: link
    };
}]);

CorvusDirectives.directive('mbScrollShadow', [function (){
    return {
        restrict: 'A',
        link: function (scope, element, attr) {
            // grab the raw dom element to check its scroll top
            var raw = element[0];
            element.on('scroll', function () {
                if(raw.scrollTop > 0) {
                    element.addClass('ScrollShadow');
                } else {
                    element.removeClass('ScrollShadow');
                }
            });
        }
    };
}]);

CorvusDirectives.directive('mbActionButton', ['$timeout', '$compile', function ($timeout, $compile) {

    return {
        restrict: 'A',
        scope: {
            actionFunction: '=mbActionButton'
        },
        link: function link(scope, element, attr) {

            var defaultText = element.text();
            var activeText = attr.activeText;
            var failedText = attr.failedText;
            var successText = attr.successText;

            var fnArg = attr.fnArg;

            var delayedReset = function() {
                // do we need to have this timeout be configurable?
                $timeout(function () {
                    element.text(defaultText);
                    element.removeClass('Button--waiting');
                    element.removeClass('Button--success');
                    element.removeClass('Button--danger');
                    element.removeAttr('disabled');
                }, 5000);
            };

            element.bind('click', function (event) {
                element.text(activeText);
                element.addClass('Button--waiting');

                // activate spinner
                var loadingIcon = angular.element('<mb-loading-icon width="12px" height="12px"></mb-loading-icon>');
                element.append(loadingIcon);
                $compile(loadingIcon)(scope);

                // disable button
                element.attr('disabled', 'true');

                // NOTE: we are assuming the action function is a promise
                var promise = (fnArg) ? scope.actionFunction(fnArg) : scope.actionFunction();

                promise.then(function (result) {
                    element.text(successText);
                    element.removeClass('Button--waiting');
                    element.addClass('Button--success');
                    var checkIcon = angular.element('<mb-icon name="check" width="12px" height="12px"></mb-icon>');
                    element.prepend(checkIcon);
                    $compile(checkIcon)(scope);

                    // re-activate button
                    element.removeAttr('disabled');

                    // timeout, reset to base
                    delayedReset();

                }, function (error) {
                    element.text(failedText);
                    element.removeClass('Button--waiting');
                    element.addClass('Button--danger');

                    // re-activate button
                    element.removeAttr('disabled');

                    // timeout, reset to base
                    delayedReset();
                });
            });
        }
    };
}]);


var NavbarDirectives = angular.module('corvus.navbar.directives', []);

NavbarDirectives.directive('mbProfileLink', [function () {

    function link($scope, element, attr) {

        $scope.userIsSuperuser = false;

        $scope.$watch('user', function (user) {
            if (!user) return;

            // extract a couple informational pieces about user
            $scope.userIsSuperuser = user.is_superuser;

            // determine initials for profile logo
            var initials = '??';
            if (user.first_name !== 'undefined') {
                initials = user.first_name.substring(0, 1);
            }

            if (user.last_name !== 'undefined') {
                initials = initials + user.last_name.substring(0, 1);
            }

            $scope.initials = initials;
        });
    }

    return {
        restrict: 'E',
        replace: true,
        template:  '<ul>' +
                        '<li class="Dropdown inline-block" dropdown on-toggle="toggled(open)">' +
                            '<a class="flex align-center" selectable-nav-item="settings" dropdown-toggle>' +
                                '<span class="UserNick">' +
                                    '<span class="UserInitials NavItem-text">{{initials}}</span> ' +
                                '</span>' +
                                '<mb-icon name="chevrondown" class="Dropdown-chevron ml1" width="8px" height="8px"></mb-icon>' +
                            '</a>' +
                            '<ul class="Dropdown-content right">' +
                                '<li><a class="link" href="/user/edit_current">Account Settings</a></li>' +
                                '<li><a class="link" ng-if="userIsSuperuser && context != \'admin\'" href="/admin/">Administration</a></li>' +
                                '<li><a class="link" ng-if="userIsSuperuser && context == \'admin\'" href="/">Exit Administration</a></li>' +
                                '<li><a class="link" href="/auth/logout">Logout</a></li>' +
                            '</ul>' +
                        '</li>' +
                    '</ul>',
        scope: {
            context: '=',
            user: '='
        },
        link: link
    };
}]);


var CorvusFormsDirectives = angular.module('corvus.forms.directives', []);

CorvusFormsDirectives.directive('cvForm', ['CorvusFormService', function(CorvusFormService) {
    function link(scope, element, attr, formControllers) {
        var formController = formControllers[0];
        var ngFormController = formControllers[1];

        if (!formController || !ngFormController) {
            return;
        }

        scope.form = ngFormController;
        formController.form = ngFormController;

        if (typeof attr.cvForm == "undefined") {
            throw "ERROR: you must specify the model name using the cv-model-name attribute on the form tag (must be available in parent scope)";
        }
        if (typeof attr.name == "undefined") {
            throw "ERROR: you must specify a form name using the name attribute on the form tag (must match your controller's first argument to the submitSuccessCallback / submitErrorCallback calls)";
        }
        formController.initializeModel(attr.cvForm);

        CorvusFormService.register(attr.name, formController);
    }

    function controller($scope, $parse, $element) {
        /*jshint validthis:true*/

        var fieldErrorControllers = {};
        var ngModelControllers = {};
        this.formStatus = "";
        this.modelName = "";
        var _self = this;

        /* saves the initial state of the model
         * backing this form (once available), so that it can be
         * restored (if necessary) with revertModel()
         */
        this.initializeModel = function(modelName) {
            this.modelName = modelName;
            if (typeof $scope.$eval(this.modelName) !== "undefined") {
                _self.saveModel();
                return;
            }
            var initialObjectListener = $scope.$watch(modelName, function(value) {
                if (value && typeof this.originalModel == "undefined") {
                    initialObjectListener();
                    _self.saveModel();
                }
            });
        };

        /* saves the current state of the model
         * backing this form, so that it can be
         * restored (if necessary) with revertModel()
         */
        this.saveModel = function() {
            if (!this.modelName) {
                console.error("ERROR: cannot save model. You must specify the model name using the cv-model-name attribute on the form tag");
                return;
            }
            _self.originalModel = angular.copy($scope.$eval(this.modelName));
        };

        this.revertModel = function(skipApply) {
            if (!this.modelName) {
                console.error("ERROR: cannot revert model. You must specify the model name using the cv-model-name attribute on the form tag");
                return;
            }
            if (!this.originalModel) {
                console.error("ERROR: cannot revert model. Original model has not been saved");
                return;
            }
            $parse(this.modelName).assign($scope, angular.copy(this.originalModel));
            if (!skipApply) {
                $scope.$apply();
            }
        };

        this.addFieldErrorsController = function(fieldName, fieldErrorsController) {
            fieldErrorControllers[fieldName] = fieldErrorsController;
        };

        this.setErrorsFor = function(fieldName, errors) {
            if (!(fieldName in fieldErrorControllers)) {
                return;
            }

            return fieldErrorControllers[fieldName].setErrors(errors);
        };

        this.clearErrorsFor = function(fieldName, errors) {
            if (!(fieldName in fieldErrorControllers)) {
                return;
            }

            return fieldErrorControllers[fieldName].clearErrors(errors);
        };

        this.addNgModelController = function(fieldName, ngModelController) {
            ngModelControllers[fieldName] = ngModelController;
        };

        this.getNgModelControllerFor = function(fieldName) {
            if (typeof ngModelControllers[fieldName] !== "undefined") {
                return ngModelControllers[fieldName];
            } else {
                return null;
            }
        };
    }

    return {
        restrict: 'AC',
        link: link,
        require: ['cvForm', '^?form'],
        controller: ['$scope', '$parse', '$element', controller]
    };
}]);

CorvusFormsDirectives.directive('input', ['CorvusFormService', function(CorvusFormService) {
    function link(scope, element, attr, controllers) {
        var ngModelController = controllers[0];
        var corvusFormController = controllers[1];

        var fieldName = attr.name;

        if (!ngModelController || !corvusFormController || !corvusFormController) {
            return;
        } else {
            corvusFormController.addNgModelController(attr.name, ngModelController);
            scope.$watch("form." + fieldName + ".$viewValue", function(value) {
                /* clear server-side validation errors when field value changes */
                scope.form[fieldName].$setValidity("serverSideValidation", true);
                /* then register or clear client-side errors */
                if (ngModelController.$dirty && ngModelController.$invalid) {
                    var errorMessages = errorMessagesFor(ngModelController);
                    if (errorMessages && errorMessages.length > 0) {
                        corvusFormController.setErrorsFor(fieldName, errorMessages);
                    }
                } else if (ngModelController.$valid) {
                    corvusFormController.clearErrorsFor(fieldName);
                }
            });
        }

        function errorMessagesFor(ngModelController) {
            return Object.keys(ngModelController.$error).map(function(key) {
                if (ngModelController.$error[key] && CorvusFormService.errorMessages[key] && key != "serverSideErrors") {
                    return CorvusFormService.errorMessages[key];
                } else {
                    return null;
                }
            }).filter(function(msg) {
                return msg !== null;
            });
        }
    }

    return {
        restrict: 'E',
        require: ['?ngModel', '?^cvForm'],
        scope: false,
        link: link
    };
}]);


CorvusFormsDirectives.directive('cvErrorFlag', function() {
    function link(scope, element, attr, corvusFormController) {
        if (typeof attr.cvErrorFlag == "undefined" || attr.cvErrorFlag.length === 0) {
            throw "ERROR: you must define a field name as the value for the cv-error-flag attribute (i.e. cv-error-flag='first_name').";
        }
        scope.$watch("form." + attr.cvErrorFlag + ".$valid", function(value) {
            var ngModelController = corvusFormController.getNgModelControllerFor(attr.cvErrorFlag);
            if (ngModelController) {
                if (ngModelController.$dirty && ngModelController.$invalid) {
                    element.addClass("error");
                } else if (ngModelController.$valid) {
                    element.removeClass("error");
                }
            }
        });
    }

    return {
        restrict: 'A',
        require: '?^cvForm',
        scope: false,
        link: link
    };
});

CorvusFormsDirectives.directive('fielderrors', function() {
    function link(scope, element, attr, controllers) {
        if (typeof attr.for == "undefined" || attr.for.length === 0) {
            throw "ERROR: you must define a field name as the value for the 'for' attribute (i.e. for='first_name').";
        }
        var fieldErrorsController = controllers[0];
        var corvusFormController = controllers[1];
        corvusFormController.addFieldErrorsController(attr.for, fieldErrorsController);
    }

    function controller($scope) {
        /*jshint validthis:true*/
        $scope.errors = [];
        this.setErrors = function(errors) {
            $scope.errors = errors;
        };

        this.clearErrors = function() {
            $scope.errors = [];
        };
    }

    return {
        restrict: 'AE',
        replace: true,
        require: ['fielderrors', '^cvForm'],
        templateUrl: '/app/user/partials/form_errors.html',
        controller: ['$scope', controller],
        link: link,
        scope: true
    };
});

CorvusFormsDirectives.directive('cvFormStatus', function() {
    function link(scope, element, attr, corvusFormController) {
        scope.corvusFormController = corvusFormController;
    }

    return {
        restrict: 'A',
        require: '^cvForm',
        template: '{{corvusFormController.formStatus}}',
        link: link
    };
});

CorvusFormsDirectives.directive('cvResetButton', function() {
    function link(scope, element, attr, corvusFormController) {
        element.bind('click', function() {
            corvusFormController.revertModel();
            corvusFormController.form.$setPristine();
            scope.$apply();
            if (typeof scope.resetCallback !== "undefined") {
                scope.resetCallback();
            }
        });
    }

    return {
        restrict: 'A',
        require: '^cvForm',
        link: link,
        scope: {
            resetCallback: '='
        }
    };
});

var CorvusACEEditorDirectives = angular.module('corvus.aceeditor.directives', ['ui.ace']);

CorvusACEEditorDirectives.directive('cvAceSqlEditor', function() {

    function controller($scope, Metabase) {
        $scope.aceLoaded = function(aceEditor) {
            if ($scope.onLoad) {
                var fn = $scope.onLoad();
                if (fn) fn(aceEditor);
            }

            var aceLanguageTools = ace.require('ace/ext/language_tools');
            aceEditor.setOptions({
                enableBasicAutocompletion: true,
                enableSnippets: true,
                enableLiveAutocompletion: true
            });

            aceLanguageTools.addCompleter({
                getCompletions: function(editor, session, pos, prefix, callback) {
                    if (prefix.lengh === 0 || !$scope.database) {
                        console.log("$scope.database is not set, unable to perform autocompletions for ACE Editor :'(");
                        callback(null, []);
                        return;
                    }

                    Metabase.db_autocomplete_suggestions({
                        dbId: $scope.database,
                        prefix: prefix
                    }, function(results) {
                        // transform results of the API call into what ACE expects
                        var js_results = results.map(function(result) {
                            return {
                                name: result[0],
                                value: result[0],
                                meta: result[1]
                            };
                        });
                        callback(null, js_results);

                    }, function(error) {
                        console.log(error);
                        callback(null, []);
                    });
                }
            });

            // focus the editor on load to allow faster editing of query
            aceEditor.focus();
        };
    }

    return {
        restrict: 'E',
        templateUrl: '/app/components/editor/editor.html',
        controller: ['$scope', 'Metabase', controller],
        scope: {
            sql: '=', // the text of the editor itself
            database: '=', // int ID of DB to use for autocompletion
            onLoad: '&onload' // optional callback of the form fn(aceEditor) in case we need a reference to it (e.g. so we can aceEditor.focus())
        }
    };
});
