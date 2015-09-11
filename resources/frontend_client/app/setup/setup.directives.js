'use strict';

var SetupDirectives = angular.module('metabase.setup.directives', []);

var setupPartialsDir = '/app/setup/partials';

SetupDirectives
    .directive('mbSetupHeader', function() {
        return {
            restrict: 'E',
            templateUrl: setupPartialsDir + '/_header.html',
            scope: {
                text: '@'
            }
        };
    });

SetupDirectives
    .directive('mbConnectionList', function() {
        return {
            restrict: 'E',
            templateUrl: setupPartialsDir + '/_connection_list.html',
            scope: {
                connections: '=',
                loading: '='
            }
        };
    });

SetupDirectives
    .directive('mbStepButton', function() {
        return {
            restrict: 'E',
            templateUrl: setupPartialsDir + '/_step_button.html',
            scope: {
                destination: '@',
                text: '@'
            },
            compile: function(element, attrs) {
                attrs.text = attrs.text || "Next";
            }
        };
    });