'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var CorvusServices = angular.module('corvus.services', ['corvus.core.services']);

CorvusServices.factory('AppState', ['$rootScope', '$routeParams', 'User', 'Organization',
    function($rootScope, $routeParams, User, Organization) {
        // this is meant to be a global service used for keeping track of our overall app state
        // we fire 2 events as things change in the app
        // 1. appstate:user
        // 2. appstate:organization

        var service = {

            model: {
                currentUser: null,
                currentOrgSlug: null,
                currentOrg: null
            },

            init: function() {
                // just make sure we grab the current user
                service.refreshCurrentUser();
            },

            refreshCurrentUser: function() {
                // this is meant to be called once on app startup
                User.current(function(result) {
                    service.model.currentUser = result;

                    $rootScope.$broadcast('appstate:user', result);
                }, function(error) {
                    console.log('unable to get current user', error);
                });
            },

            routeChanged: function(event) {
                // whenever we have a route change (including initial page load) we need to establish some context

                // NOTE: if you try to do this outside this event you'll run into issues where $routeParams is not set.
                //       so that's why we explicitly wait until we know when $routeParams will be available
                if ($routeParams.orgSlug) {
                    // the url is telling us what Organization we are working in
                    if (service.model.currentOrgSlug != $routeParams.orgSlug) {
                        // if we just navigated to a different organization then fetch the full org now
                        Organization.get_by_slug({
                            'slug': $routeParams.orgSlug
                        }, function(org) {
                            service.model.currentOrg = org;
                            $rootScope.$broadcast('appstate:organization', service.model.currentOrg);
                        }, function(error) {
                            console.log('error getting current org', error);
                        });

                        service.model.currentOrgSlug = $routeParams.orgSlug;
                    }

                    // if we get here it just means we navigated somewhere within the existing org, so do nothing

                } else if (!service.model.currentOrgSlug) {
                    // the url doesn't tell us what Organization this is, so lets try a different approach
                    if (service.model.currentUser) {

                        // TODO: a better approach might be to set a cookie indicating the last org the user was on
                        if (service.model.currentUser.org_perms.length > 0) {
                            service.model.currentOrg = service.model.currentUser.org_perms[0].organization;
                            service.model.currentOrgSlug = service.model.currentOrg.slug;
                            $rootScope.$broadcast('appstate:organization', service.model.currentOrg);
                        } else {
                            // TODO: this is a real issue.  we have a user with no organizations.  where do we send them?
                        }
                    }
                }
            }
        };

        // listen for all route changes so that we can update organization as appropriate
        $rootScope.$on('$routeChangeSuccess', service.routeChanged);

        return service;
    }
]);

CorvusServices.service('CorvusCore', ['$resource', 'User', function($resource, User) {
    this.perms = [{
        'id': 0,
        'name': 'Private'
    }, {
        'id': 1,
        'name': 'Others can read'
    }, {
        'id': 2,
        'name': 'Others can read and modify'
    }];

    this.permName = function(permId) {
        if (permId >= 0 && permId <= (this.perms.length - 1)) {
            return this.perms[permId].name;
        }
        return null;
    };

    this.charts = [{
        'id': 'scalar',
        'name': 'Scalar'
    }, {
        'id': 'table',
        'name': 'Table'
    }, {
        'id': 'pie',
        'name': 'Pie Chart'
    }, {
        'id': 'bar',
        'name': 'Bar Chart'
    }, {
        'id': 'line',
        'name': 'Line Chart'
    }, {
        'id': 'area',
        'name': 'Area Chart'
    }, {
        'id': 'timeseries',
        'name': 'Time Series'
    }, {
        'id': 'pin_map',
        'name': 'Pin Map'
    }, {
        'id': 'country',
        'name': 'World Heatmap'
    }, {
        'id': 'state',
        'name': 'State Heatmap'
    }];

    this.chartName = function(chartId) {
        for (var i = 0; i < this.charts.length; i++) {
            if (this.charts[i].id == chartId) {
                return this.charts[i].name;
            }
        }
        return null;
    };

    this.table_entity_types = [{
        'id': null,
        'name': 'None'
    }, {
        'id': 'person',
        'name': 'Person'
    }, {
        'id': 'event',
        'name': 'Event'
    }, {
        'id': 'photo',
        'name': 'Photo'
    }, {
        'id': 'place',
        'name': 'Place'
    }, {
        'id': 'evt-cohort',
        'name': 'Cohorts-compatible Event'
    }];

    this.tableEntityType = function(typeId) {
        for (var i = 0; i < this.table_entity_types.length; i++) {
            if (this.table_entity_types[i].id == typeId) {
                return this.table_entity_types[i].name;
            }
        }
        return null;
    };

    this.field_special_types = [{
        'id': null,
        'name': 'None'
    }, {
        'id': 'avatar',
        'name': 'Avatar Image URL'
    }, {
        'id': 'category',
        'name': 'Category'
    }, {
        'id': 'city',
        'name': 'City'
    }, {
        'id': 'country',
        'name': 'Country'
    }, {
        'id': 'desc',
        'name': 'Description'
    }, {
        'id': 'fk',
        'name': 'Foreign Key'
    }, {
        'id': 'id',
        'name': 'Entity Key'
    }, {
        'id': 'image',
        'name': 'Image URL'
    }, {
        'id': 'json',
        'name': 'Field containing JSON'
    }, {
        'id': 'latitude',
        'name': 'Latitude'
    }, {
        'id': 'longitude',
        'name': 'Longitude'
    }, {
        'id': 'name',
        'name': 'Entity Name'
    }, {
        'id': 'number',
        'name': 'Number'
    }, {
        'id': 'state',
        'name': 'State'
    }, {
        'id': 'url',
        'name': 'URL'
    }, {
        'id': 'zip_code',
        'name': 'Zip Code'
    }];
    this.field_field_types = [{
        'id': null,
        'name': 'None'
    }, {
        'id': 'info',
        'name': 'Information'
    }, {
        'id': 'metric',
        'name': 'Metric'
    }, {
        'id': 'dimension',
        'name': 'Dimension'
    }];

    this.boolean_types = [{
        'id': true,
        'name': 'Yes'
    }, {
        'id': false,
        'name': 'No'
    }];

    this.fieldSpecialType = function(typeId) {
        for (var i = 0; i < this.field_special_types.length; i++) {
            if (this.field_special_types[i].id == typeId) {
                return this.field_special_types[i].name;
            }
        }
        return null;
    };

    this.builtinToChart = {
        'latlong_heatmap': 'll_heatmap'
    };

    this.getTitleForBuiltin = function(viewtype, field1Name, field2Name) {
        var builtinToTitleMap = {
            'state': 'State Heatmap',
            'country': 'Country Heatmap',
            'pin_map': 'Pin Map',
            'heatmap': 'Heatmap',
            'cohorts': 'Cohorts',
            'latlong_heatmap': 'Lat/Lon Heatmap'
        };

        var title = builtinToTitleMap[viewtype];
        if (field1Name) {
            title = title.replace("{0}", field1Name);
        }
        if (field2Name) {
            title = title.replace("{1}", field2Name);
        }

        return title;
    };

    this.createLookupTables = function(table) {
        // Create lookup tables (ported from ExploreTableDetailData)

        table.fields_lookup = {};
        _.each(table.fields, function(field) {
            table.fields_lookup[field.id] = field;
            field.operators_lookup = {};
            _.each(field.valid_operators, function(operator) {
                field.operators_lookup[operator.name] = operator;
            });
        });

        table.aggregation_lookup = {};
        _.each(table.aggregation_options, function(agg) {
            table.aggregation_lookup[agg.short] = agg;
        });
    };

    // this just makes it easier to access the current user
    this.currentUser = User.current;
}]);

CorvusServices.service('CorvusAlert', [function() {
    this.alerts = [];

    this.closeAlert = function(index) {
        this.alerts.splice(index, 1);
    };

    this.alertInfo = function(message) {
        this.alerts.push({
            type: 'success',
            msg: message
        });
    };

    this.alertError = function(message) {
        this.alerts.push({
            type: 'danger',
            msg: message
        });
    };
}]);

CorvusServices.factory("transformRequestAsFormPost", [function() {
    return (transformRequest);

    function transformRequest(data, getHeaders) {
        var headers = getHeaders();
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
        headers["X-CSRFToken"] = data.csrfmiddlewaretoken;
        return (serializeData(data));
    }

    function serializeData(data) {

        // If this is not an object, defer to native stringification.
        if (!angular.isObject(data)) {
            return ((data === null) ? "" : data.toString());
        }

        var buffer = [];

        // Serialize each key in the object.
        for (var name in data) {
            if (!data.hasOwnProperty(name)) {
                continue;
            }

            var value = data[name];
            buffer.push(
                encodeURIComponent(name) +
                "=" +
                encodeURIComponent((value === null) ? "" : value)
            );
        }

        // Serialize the buffer and clean it up for transportation.
        var source = buffer
            .join("&")
            .replace(/%20/g, "+");

        return (source);
    }

}]);

CorvusServices.service('CorvusFormService', function() {
    // Registered form controllers
    var formControllers = [];

    this.errorMessages = {
        required: 'This field is required',
        email: 'Not a valid email address',
        password_verify: 'Passwords must match'
    };

    this.setFormErrors = function(formName, errors) {
        var formController = formControllers[formName];
        if (typeof formController == "undefined") {
            throw ("ERROR: unknown form name: " + formName + "; cannot continue");
        }

        Object.keys(errors).forEach(function(fieldName) {
            if (typeof formController.form[fieldName] == "undefined") {
                console.error("ERROR submitting form; error does not map to a valid field name: " + fieldName + ": " + errors[fieldName]);
                formController.formStatus = formController.formStatus + "; " + fieldName + ": " + errors[fieldName];
                return;
            }
            formController.form[fieldName].$dirty = true;
            formController.form[fieldName].$setValidity('serverSideValidation', false);
            formController.setErrorsFor(fieldName, errors[fieldName]);
        });
    };

    // Registers form controller by form name
    this.register = function(formName, formController) {
        formControllers[formName] = formController;
    };

    this.getFormController = function(formName) {
        var formController = formControllers[formName];
        if (typeof formController == "undefined") {
            throw ("ERROR: unknown form name: " + formName + "; cannot continue");
        }

        return formController;
    };

    this.clearServerSideValidationErrors = function(formName) {
        var formController = formControllers[formName];
        if (typeof formController == "undefined") {
            throw ("ERROR: unknown form name: " + formName + "; cannot continue");
        }

        _.each(formController.form, function(field) {
            if (field.hasOwnProperty("$setValidity")) {
                field.$setValidity("serverSideValidation", true);
            }
        });
    };

    this.submitSuccessCallback = function(formName, successMessage) {
        var formController = formControllers[formName];
        if (typeof formController == "undefined") {
            throw ("ERROR: unknown form name: " + formName + "; cannot continue");
        }

        this.clearServerSideValidationErrors(formName);
        formController.formStatus = successMessage;
        formController.form.$setPristine();
        formController.saveModel();
    };

    this.submitFailedCallback = function(formName, err, failedMessage) {
        var formController = formControllers[formName];
        if (typeof formController == "undefined") {
            throw ("ERROR: unknown form name: " + formName + "; cannot continue");
        }
        formController.formStatus = failedMessage;

        this.setFormErrors(formName, err);
    };


});


// User Services
var CoreServices = angular.module('corvus.core.services', ['ngResource', 'ngCookies']);
CoreServices.factory('User', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/user/:userId', {}, {
        list: {
            url: '/api/user/',
            method: 'GET',
            isArray: true
        },
        current: {
            url: '/api/user/current/',
            method: 'GET',
        },
        get: {
            url: '/api/user/:userId',
            method: 'GET',
            params: {
                'userId': '@userId'
            }
        },
        update: {
            url: '/api/user/:userId',
            method: 'PUT',
            params: {
                'userId': '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        update_password: {
            url: '/api/user/update_password/:userId',
            method: 'PUT',
            params: {
                'userId': '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        send_password_reset_email: {
            url: '/api/user/send_password_reset_email/:userId',
            method: 'GET',
            params: {
                'userId': '@id'
            }
        }
    });
}]);

CoreServices.factory('Organization', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/org/:orgId', {}, {
        list: {
            url: '/api/org/',
            method: 'GET',
            isArray: true
        },
        get: {
            url: '/api/org/:orgId',
            method: 'GET',
            params: {
                orgId: '@orgId'
            }
        },
        get_by_slug: {
            url: '/api/org/slug/:slug',
            method: 'GET',
            params: {
                slug: '@slug'
            }
        },
        update: {
            url: '/api/org/:orgId',
            method: 'PUT',
            params: {
                orgId: '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        members: {
            url: '/api/org/:orgId/members',
            method: 'GET',
            params: {
                orgId: '@orgId'
            },
            isArray: true
        },
        member_create: {
            url: '/api/org/:orgId/members',
            method: 'POST',
            params: {
                orgId: '@orgId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        member_add: {
            url: '/api/org/:orgId/members/:userId',
            method: 'POST',
            params: {
                orgId: '@orgId',
                userId: '@userId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        member_update: {
            url: '/api/org/:orgId/members/:userId',
            method: 'PUT',
            params: {
                orgId: '@orgId',
                userId: '@userId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        member_remove: {
            url: '/api/org/:orgId/members/:userId',
            method: 'DELETE',
            params: {
                orgId: '@orgId',
                userId: '@userId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        }
    });
}]);