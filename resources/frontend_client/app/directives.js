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

CorvusDirectives.directive('mbReactComponent', ['$timeout', function ($timeout) {
    return {
        restrict: 'A',
        link: function (scope, element, attr) {
            var Component = scope[attr.mbReactComponent];
            delete scope[attr.mbReactComponent];

            function render() {
                var props = {};
                angular.forEach(scope, function(value, key) {
                    if (typeof value === "function") {
                        props[key] = function() {
                            try {
                                return value.apply(this, arguments);
                            } finally {
                                $timeout(() => scope.$digest());
                            }
                        }
                    } else {
                        props[key] = value;
                    }
                });
                React.render(<Component {...props}/>, element[0]);
            }

            scope.$on("$destroy", function() {
                React.unmountComponentAtNode(element[0]);
            });

            // limit renders to once per animation frame
            var timeout;
            scope.$watch(function() {
                if (!timeout) {
                    timeout = requestAnimationFrame(function() {
                      timeout = null;
                      render();
                    });
                }
            });

            render();
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
        templateUrl: '/app/partials/mb_profile_link.html',
        scope: {
            context: '=',
            user: '='
        },
        link: link
    };
}]);

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
