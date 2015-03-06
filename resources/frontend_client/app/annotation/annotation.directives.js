'use strict';

var AnnotationDirectives = angular.module('corvus.annotation.directives', ['corvus.annotation.services', 'corvus.services']);

AnnotationDirectives.directive('cvAnnotationForm', ['$filter', 'Annotation', 'AppState',
    function ($filter, Annotation, AppState) {
        function link(scope, element, attr) {

            scope.DATE_FORMAT = "MMM dd, yyyy";

            scope.annotations = [];
            scope.visible_annotations = [];

            scope.new_annotation = {};
            scope.startPicker = {
                'isOpen': false,
                'date': undefined
            };
            scope.endPicker = {
                'isOpen': false,
                'date': undefined
            };
            scope.edit_mode = false;
            scope.expanded_view = false;
            scope.from_date = false;

            scope.datepickerOpts = {

            };

            var formatDate = function(dateStr) {
                return $filter('date')(Date.parse(dateStr), 'mediumDate');
            };

            scope.toggleExpandedView = function() {
                scope.expanded_view = !scope.expanded_view;

                updateVisibleAnnotations();
            };

            scope.toggleEditMode = function() {
                scope.edit_mode = !scope.edit_mode;

                // main reason to do this each time we toggle edit mode is so that our default start/end are
                // as current as we can possibly make them
                prepNewAnnotation();
            };

            scope.getAnnotationTimeframe = function(annotation) {
                if (!annotation) return;

                if (annotation.start === annotation.end) {
                    // single point in time
                    return formatDate(annotation.start);
                } else {
                    // time range
                    return formatDate(annotation.start) + ' - ' + formatDate(annotation.end);
                }
            };

            var updateVisibleAnnotations = function() {
                // decides what annotations are visible to the directive depending on value of expanded_view
                var visible_annotations;
                if (scope.expanded_view) {
                    visible_annotations = scope.annotations;
                } else {
                    visible_annotations = scope.annotations.slice(0, 1);
                }

                scope.visible_annotations = visible_annotations;
            };

            scope.openCalendar = function($event, type) {
                $event.preventDefault();
                $event.stopPropagation();

                if (type === 'start') {
                    scope.startPicker.isOpen = true;
                } else if (type === 'end') {
                    scope.endPicker.isOpen = true;
                }
            };

            scope.create = function() {
                // grab current organization from our AppState
                if (AppState.model.currentOrg) {
                    // we need to set the orgId before we save
                    scope.new_annotation.organization = AppState.model.currentOrg.id;

                    // make sure we handle start/end date formatting properly
                    scope.new_annotation.start = scope.startPicker.date.toISOString();
                    scope.new_annotation.end = scope.endPicker.date.toISOString();

                    Annotation.create(scope.new_annotation, function (annotation) {
                        scope.annotations.unshift(annotation);
                        // TODO: user confirmation

                        updateVisibleAnnotations();

                        prepNewAnnotation();
                    }, function (error) {
                        console.log('error creating annotation', error);
                    });
                } else {
                    // this is something we can't recover from
                    console.log('cant add annotation because I dont know what organization is in context');
                }
            };

            var prepNewAnnotation = function() {
                var now = new Date();

                scope.startPicker.date = now;
                scope.endPicker.date = now;

                scope.new_annotation = {
                    'object_model': scope.objectModel,
                    'object_id': scope.objectId
                };
            };

            var loadAnnotations = function(org) {
                if (scope.objectId) {
                    Annotation.list({
                        'org': org.id,
                        'object_model': scope.objectModel,
                        'object_id': scope.objectId
                    }, function (annotations) {
                        scope.annotations = annotations;

                        updateVisibleAnnotations();
                    }, function (error) {
                        console.log('error getting annotations list', error);
                    });
                }
            };

            scope.$on('appstate:organization', function (event, org) {
                loadAnnotations(org);
            });

            if (AppState.model.currentOrg) {
                loadAnnotations(AppState.model.currentOrg);
            }

        }

        return {
            restrict: 'E',
            replace: true,
            templateUrl: '/app/annotation/partials/annotation_form.html',
            scope: {
                objectModel: '@model',
                objectId: '@id'
            },
            link: link
        };
    }
]);
