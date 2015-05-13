'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

var CorvusServices = angular.module('corvus.services', ['http-auth-interceptor', 'ipCookie', 'corvus.core.services']);

CorvusServices.factory('AppState', ['$rootScope', '$routeParams', '$q', '$location', '$timeout', 'ipCookie', 'Session', 'User', 'Organization', 'PermissionViolation',
    function($rootScope, $routeParams, $q, $location, $timeout, ipCookie, Session, User, Organization, PermissionViolation) {
        // this is meant to be a global service used for keeping track of our overall app state
        // we fire 2 events as things change in the app
        // 1. appstate:user
        // 2. appstate:organization

        var initPromise;
        var currentUserPromise;

        var service = {

            model: {
                setupToken: null,
                currentUser: null,
                currentOrgSlug: null,
                currentOrg: null,
                appContext: 'unknown'
            },

            init: function() {

                if (!initPromise) {
                    var deferred = $q.defer();
                    initPromise = deferred.promise;

                    // just make sure we grab the current user
                    service.refreshCurrentUser().then(function(user) {
                        deferred.resolve();
                    }, function(error) {
                        deferred.resolve();
                    });
                }

                return initPromise;
            },

            clearState: function() {
                currentUserPromise = null;
                service.model.currentUser = null;
                service.model.currentOrgSlug = null;
                service.model.currentOrg = null;

                // clear any existing session cookies if they exist
                ipCookie.remove('metabase.SESSION_ID');
            },

            setCurrentOrgCookie: function(slug) {
                var isSecure = ($location.protocol() === "https") ? true : false;
                ipCookie('metabase.CURRENT_ORG', slug, {
                    path: '/',
                    secure: isSecure
                });
            },

            refreshCurrentUser: function() {

                // this is meant to be called once on app startup
                var userRefresh = User.current(function(result) {
                    service.model.currentUser = result;

                    // add isMember(orgSlug) method to the object
                    service.model.currentUser.isMember = function(orgSlug) {
                        return this.org_perms.some(function(org_perm) {
                            return org_perm.organization.slug === orgSlug;
                        });
                    };

                    // add isAdmin(orgSlug) method to the object
                    service.model.currentUser.isAdmin = function(orgSlug) {
                        return this.org_perms.some(function(org_perm) {
                            return org_perm.organization.slug === orgSlug && org_perm.admin;
                        }) || this.is_superuser;
                    };

                    // add memberOf() method to the object enumerating Organizations user is member of
                    service.model.currentUser.memberOf = function() {
                        return this.org_perms.map(function(org_perm) {
                            return org_perm.organization;
                        });
                    };

                    // add adminOf() method to the object enumerating Organizations user is admin of
                    service.model.currentUser.adminOf = function() {
                        return this.org_perms.filter(function(org_perm) {
                            return org_perm.admin;
                        }).map(function(org_perm) {
                            return org_perm.organization;
                        });
                    };

                    // apply a convenience variable indicating if the user is a member of multiple orgs
                    service.model.currentUser.is_multi_org = (service.model.currentUser.memberOf().length > 1);

                    $rootScope.$broadcast('appstate:user', result);

                }, function(error) {
                    console.log('unable to get current user', error);
                });

                // NOTE: every time we refresh the user we update our current promise to ensure that
                //       we can guarantee we've resolved the current user
                currentUserPromise = userRefresh.$promise;

                return currentUserPromise;
            },

            switchOrg: function(org_slug) {
                Organization.get_by_slug({
                    'slug': org_slug
                }, function(org) {
                    service.model.currentOrgSlug = org.slug;
                    service.model.currentOrg = org;
                    $rootScope.$broadcast('appstate:organization', service.model.currentOrg);
                }, function(error) {
                    console.log('error getting current org', error);
                });
            },

            // This function performs whatever state cleanup and next steps are required when a user tries to access
            // something they are not allowed to.
            invalidAccess: function(user, url, message) {
                service.model.currentOrgSlug = null;
                service.model.currentOrg = null;

                PermissionViolation.create({
                    'user': user.id,
                    'url': url
                });
                $location.path('/unauthorized/');

            },

            routeChanged: function(event) {
                // establish our application context based on the route (URI)
                // valid app contexts are: 'setup', 'auth', 'org', 'org-admin', 'site-admin', 'other', or 'unknown'
                var routeContext;
                if ($location.path().indexOf('/auth/') === 0) {
                    routeContext = 'auth';
                } else if ($location.path().indexOf('/setup/') === 0) {
                    routeContext = 'setup';
                } else if ($location.path().indexOf('/superadmin/') === 0) {
                    routeContext = 'site-admin';
                } else if ($routeParams.orgSlug) {
                    // couple of options when within an org
                    if ($location.path().indexOf('/' + $routeParams.orgSlug + '/admin/') === 0) {
                        routeContext = 'org-admin';
                    } else {
                        routeContext = 'org';
                    }
                } else {
                    routeContext = 'other';
                }

                // if the context of the app has changed due to this route change then send out an event
                if (service.model.appContext !== routeContext) {
                    service.model.appContext = routeContext;
                    $rootScope.$broadcast('appstate:context-changed', service.model.appContext);
                }

                // this code is here to ensure that we have resolved our currentUser BEFORE we execute any other
                // code meant to establish app context based on the current route
                currentUserPromise.then(function(user) {
                    service.routeChangedImpl(event);
                }, function(error) {
                    service.routeChangedImpl(event);
                });
            },

            routeChangedImpl: function(event) {
                // whenever we have a route change (including initial page load) we need to establish some context

                // if we don't have a current user then the only sensible destination is the login page
                if (!service.model.currentUser) {
                    // make sure we clear out any current state just to be safe
                    service.clearState();

                    if ($location.path().indexOf('/auth/') !== 0 && $location.path().indexOf('/setup/') !== 0) {
                        // if the user is asking for a url outside of /auth/* then send them to login page
                        // otherwise we will let the user continue on to their requested page
                        $location.path('/auth/login');
                    }

                    return;
                }

                var onSuperadminPage = $location.path().indexOf('/superadmin/') === 0;

                // NOTE: if you try to do this outside this event you'll run into issues where $routeParams is not set.
                //       so that's why we explicitly wait until we know when $routeParams will be available
                if (onSuperadminPage) {
                    // the user is trying to change to a superuser page

                    if (!service.model.currentUser.is_superuser) {
                        service.invalidAccess(service.model.currentUser, $location.url(), "user is not a superuser!!!");
                        return;
                    }

                } else if ($routeParams.orgSlug) {
                    // the url is telling us what Organization we are working in
                    // PERMISSIONS CHECK!!  user must be member of this org to proceed
                    // Making convenience vars so it's easier to scan conditions for correctness
                    var isSuperuser = service.model.currentUser.is_superuser;
                    var isOrgMember = service.model.currentUser.isMember($routeParams.orgSlug);
                    var isOrgAdmin = service.model.currentUser.isAdmin($routeParams.orgSlug);
                    var onAdminPage = $location.path().indexOf('/' + $routeParams.orgSlug + '/admin') === 0;

                    if (!isSuperuser && !isOrgMember) {
                        service.invalidAccess(service.model.currentUser, $location.url(), "user is not authorized for this org!!!");
                        return;
                    } else if (onAdminPage && !isSuperuser && !isOrgAdmin) {
                        service.invalidAccess(service.model.currentUser, $location.url(), "user is not an admin for this org!!!");
                        return;
                    }

                    if (service.model.currentOrgSlug != $routeParams.orgSlug) {
                        // we just navigated to a new organization
                        this.switchOrg($routeParams.orgSlug);
                        service.model.currentOrgSlug = $routeParams.orgSlug;
                        service.setCurrentOrgCookie(service.model.currentOrgSlug);
                    }

                    // if we get here it just means we navigated somewhere within the existing org, so do nothing

                } else if (!service.model.currentOrgSlug) {
                    // the url doesn't tell us what Organization this is, so lets try a different approach
                    // Check to see if the user has a current org cookie var set
                    var currentOrgFromCookie = ipCookie('metabase.CURRENT_ORG');
                    if (currentOrgFromCookie) {
                        // check to see if the org slug exists
                        var orgsWithSlug = service.model.currentUser.org_perms.filter(function(org_perm) {
                            return org_perm.organization.slug == currentOrgFromCookie;
                        });
                        if (orgsWithSlug.length > 0) {
                            var currentOrgPerm = orgsWithSlug[0];
                            service.model.currentOrg = currentOrgPerm.organization;
                            service.model.currentOrgSlug = service.model.currentOrg.slug;
                            service.setCurrentOrgCookie(service.model.currentOrgSlug);
                            $rootScope.$broadcast('appstate:organization', service.model.currentOrg);
                            return;
                        }
                    }
                    // Otherwise fall through and set the current org to the first org a user is a member of
                    if (service.model.currentUser.org_perms.length > 0) {
                        service.model.currentOrg = service.model.currentUser.org_perms[0].organization;
                        service.model.currentOrgSlug = service.model.currentOrg.slug;
                        service.setCurrentOrgCookie(service.model.currentOrgSlug);
                        $rootScope.$broadcast('appstate:organization', service.model.currentOrg);
                    } else {
                        // TODO: this is a real issue.  we have a user with no organizations.  where do we send them?
                    }
                }
            }
        };

        // listen for all route changes so that we can update organization as appropriate
        $rootScope.$on('$routeChangeSuccess', service.routeChanged);

        // login just took place, so lets force a refresh of the current user
        $rootScope.$on("appstate:login", function(event, session_id) {
            service.refreshCurrentUser();
        });

        // logout just took place, do some cleanup
        $rootScope.$on("appstate:logout", function(event, session_id) {

            // clear out any current state
            service.clearState();

            // NOTE that we don't really care about callbacks in this case
            Session.delete({
                'session_id': session_id
            });
        });

        // NOTE: the below events are generated from the http-auth-interceptor which listens on our $http calls
        //       and intercepts calls that result in a 401 or 403 so that we can handle them here.  You must be
        //       careful to consider the implications of this because any endpoint that returns a 401/403 can
        //       have its call stack interrupted now and handled here instead of its normal callback sequence.

        // $http interceptor received a 401 response
        $rootScope.$on("event:auth-loginRequired", function() {
            // this is effectively just like a logout, we want to reset everything to a base state, then force login
            service.clearState();

            // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
            $timeout(function() {
                $location.path('/auth/login');
            }, 300);
        });

        // $http interceptor received a 403 response
        $rootScope.$on("event:auth-forbidden", function() {
            $location.path("/unauthorized");
        });

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
    }, ];

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

    // The various DB engines we support <3
    // TODO - this should probably come back from the API, no?
    this.ENGINES = {
        postgres: {
            name: 'Postgres',
            fields: [{
                displayName: "Host",
                fieldName: "host",
                placeholder: "localhost",
                required: true
            }, {
                displayName: "Port",
                fieldName: "port",
                placeholder: "5432",
                required: true
            }, {
                displayName: "Database name",
                fieldName: "dbname",
                placeholder: "birds_of_the_world",
                required: true
            }, {
                displayName: "Database username",
                fieldName: "user",
                placeholder: "What username do you use to login to the database?",
                required: true
            }, {
                displayName: "Database password",
                fieldName: "pass",
                placeholder: "*******"
            }, {
                displayName: "Use a secure connection (SSL)?",
                fieldName: "ssl",
                choices: [{
                    name: 'Yes <3',
                    value: true,
                    selectionAccent: 'active'
                }, {
                    name: 'No :/',
                    value: false,
                    selectionAccent: 'danger'
                }]
            }],
            parseDetails: function(details) {
                var map = {
                    ssl: details.ssl
                };
                details.conn_str.split(' ').forEach(function(val) {
                    var split = val.split('=');
                    if (split.length === 2) {
                        map[split[0]] = split[1];
                    }
                });
                return map;
            },
            buildDetails: function(details) {
                var connStr = "host=" + details.host + " port=" + details.port + " dbname=" + details.dbname + " user=" + details.user;
                if (details.pass) {
                    connStr += " password=" + details.pass;
                }
                return {
                    conn_str: connStr,
                    ssl: details.ssl
                };
            }
        },
        h2: {
            name: 'H2',
            fields: [{
                displayName: "Connection String",
                fieldName: "connectionString",
                placeholder: "file:/Users/camsaul/bird_sightings/toucans;AUTO_SERVER=TRUE"
            }],
            parseDetails: function(details) {
                return {
                    connectionString: details.conn_str
                };
            },
            buildDetails: function(details) {
                return {
                    conn_str: details.connectionString
                };
            }
        },
        mongo: {
            name: 'MongoDB',
            fields: [{
                displayName: "Host",
                fieldName: "host",
                placeholder: "localhost",
                required: true
            }, {
                displayName: "Port",
                fieldName: "port",
                placeholder: "27017"
            }, {
                displayName: "Database name",
                fieldName: "dbname",
                placeholder: "carrierPigeonDeliveries",
                required: true
            }, {
                displayName: "Database username",
                fieldName: "user",
                placeholder: "What username do you use to login to the database?"
            }, {
                displayName: "Database password",
                fieldName: "pass",
                placeholder: "******"
            }],
            parseDetails: function(details) {
                var regex = /^mongodb:\/\/(?:([^@:]+)(?::([^@:]+))?@)?([^\/:@]+)(?::([\d]+))?\/([^\/]+)$/gm, // :scream:
                    matches = regex.exec(details.conn_str);
                return {
                    user: matches[1],
                    pass: matches[2],
                    host: matches[3],
                    port: matches[4],
                    dbname: matches[5]
                };
            },
            buildDetails: function(details) {
                var connStr = "mongodb://";
                if (details.user) {
                    connStr += details.user;
                    if (details.pass) {
                        connStr += ":" + details.pass;
                    }
                    connStr += "@";
                }
                connStr += details.host;
                if (details.port) {
                    connStr += ":" + details.port;
                }
                connStr += "/" + details.dbname;
                return {
                    conn_str: connStr
                };
            }
        }
    };
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

CoreServices.factory('Session', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/session/', {}, {
        create: {
            method: 'POST',
            ignoreAuthModule: true // this ensures a 401 response doesn't trigger another auth-required event
        },
        delete: {
            method: 'DELETE',
        },
        forgot_password: {
            url: '/api/session/forgot_password',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        reset_password: {
            url: '/api/session/reset_password',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        }
    });
}]);

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
            ignoreAuthModule: true // this ensures a 401 response doesn't trigger another auth-required event
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
            url: '/api/user/:userId/password',
            method: 'PUT',
            params: {
                'userId': '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        }
    });
}]);

CoreServices.factory('Organization', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/org/:orgId', {}, {
        form_input: {
            url: '/api/org/form_input',
            method: 'GET'
        },
        list: {
            url: '/api/org/',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/org',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
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
        delete: {
            url: '/api/org/:orgId',
            method: 'DELETE',
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
        member_get: {
            url: '/api/org/:orgId/members/:userId',
            method: 'GET',
            params: {
                orgId: '@orgId',
                userId: '@userId'
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

CoreServices.factory('PermissionViolation', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/permissions_violation', {}, {
        create: {
            url: '/api/permissions_violation',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },

    });
}]);