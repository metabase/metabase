import React from "react";

import { Provider } from 'react-redux';
import { DevTools, DebugPanel } from 'redux-devtools/lib/react';

import ProfileLink from './components/ProfileLink.jsx'

/* Directives */
var MetabaseDirectives = angular.module('metabase.directives', []);

MetabaseDirectives.directive('deleteConfirm', [function() {
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

MetabaseDirectives.directive('mbDelayedCall', ['$timeout', function($timeout) {

    function link(scope, element, attr) {
        var delay = attr.delay;
        if (!delay) {
            delay = 8000;
        }

        var func = attr.mbDelayedCall;

        $timeout(() => scope.$eval(func), delay);
    }

    return {
        restrict: 'A',
        link: link
    };
}]);

MetabaseDirectives.directive('mbScrollShadow', [function (){
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

MetabaseDirectives.directive('mbActionButton', ['$timeout', '$compile', function ($timeout, $compile) {

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

MetabaseDirectives.directive('mbReduxComponent', ['$timeout', function ($timeout) {
    return {
        restrict: 'A',
        link: function (scope, element, attr) {
            if (scope.monitor) {
                var win = window.open(null, "redux-devtools", "menubar=no,location=no,resizable=yes,scrollbars=no,status=no");
                win.location.reload();
                setTimeout(function() {
                    React.render(
                        <DebugPanel top right bottom left >
                            <DevTools store={scope.store} monitor={scope.monitor} />
                        </DebugPanel>
                    , win.document.body);
                }, 10);
            }

            React.render(
                <Provider store={scope.store}>
                    {() => <scope.Component {...scope.props} />}
                </Provider>,
                element[0]
            );

            scope.$on("$destroy", function() {
                React.unmountComponentAtNode(element[0]);
            });
        }
    };
}]);

MetabaseDirectives.directive('mbReactComponent', ['$timeout', function ($timeout) {
    return {
        restrict: 'A',
        link: function (scope, element, attr) {
            var Component = scope[attr.mbReactComponent];
            delete scope[attr.mbReactComponent];

            function render() {
                var props = {};
                function copyProps(dest, src) {
                    for (var key in src) {
                        copyProp(dest, key, src[key]);
                    }
                }
                function copyProp(dest, key, value) {
                    if (typeof value === "function") {
                        dest[key] = function() {
                            try {
                                return value.apply(this, arguments);
                            } finally {
                                $timeout(() => scope.$digest());
                            }
                        }
                        copyProps(dest[key], value);
                    } else {
                        dest[key] = value;
                    }
                }
                copyProps(props, scope)
                React.render(<Component {...props}/>, element[0]);
            }

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

            scope.$on("$destroy", function() {
                React.unmountComponentAtNode(element[0]);
                // make sure to clear the timeout if set otherwise we might accidentally render a destroyed component
                if (timeout) {
                    window.cancelAnimationFrame(timeout);
                    timeout = null;
                }
            });

            render();
        }
    };
}]);

var NavbarDirectives = angular.module('metabase.navbar.directives', []);

NavbarDirectives.directive('mbProfileLink', [function () {

    return {
        restrict: 'A',
        template: '<div mb-react-component="ProfileLink"></div>',
        controller: ['$scope', function ($scope) {
            $scope.ProfileLink = ProfileLink;
        }],
        scope: {
            context: '=',
            user: '='
        },
    };
}]);
