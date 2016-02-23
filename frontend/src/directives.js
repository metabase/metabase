import React from "react";
import ReactDOM from "react-dom";

import { Provider } from 'react-redux';
import { DevTools, DebugPanel } from 'redux-devtools/lib/react';

/* Directives */
var MetabaseDirectives = angular.module('metabase.directives', []);

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

MetabaseDirectives.directive('mbReduxComponent', ['$timeout', function ($timeout) {
    return {
        restrict: 'A',
        link: function (scope, element, attr) {
            if (scope.monitor) {
                var win = window.open(null, "redux-devtools", "menubar=no,location=no,resizable=yes,scrollbars=no,status=no");
                win.location.reload();
                setTimeout(function() {
                    ReactDOM.render(
                        <DebugPanel top right bottom left >
                            <DevTools store={scope.store} monitor={scope.monitor} />
                        </DebugPanel>
                    , win.document.body);
                }, 10);
            }

            ReactDOM.render(
                <Provider store={scope.store}>
                    <scope.Component {...scope.props} />
                </Provider>,
                element[0]
            );

            scope.$on("$destroy", function() {
                ReactDOM.unmountComponentAtNode(element[0]);
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
                ReactDOM.render(<Component {...props}/>, element[0]);
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
                ReactDOM.unmountComponentAtNode(element[0]);
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
