'use strict';
/*jslint browser:true */
/*global _*/
/* Services */

import MetabaseAnalytics from './lib/metabase_analytics';

var CorvusServices = angular.module('corvus.services', ['http-auth-interceptor', 'ipCookie', 'corvus.core.services']);

CorvusServices.factory('AppState', ['$rootScope', '$q', '$location', '$timeout', 'ipCookie', 'Session', 'User', 'Settings',
    function($rootScope, $q, $location, $timeout, ipCookie, Session, User, Settings) {
        // this is meant to be a global service used for keeping track of our overall app state
        // we fire 2 events as things change in the app
        // 1. appstate:user

        var initPromise;
        var currentUserPromise;

        var service = {

            model: {
                setupToken: null,
                currentUser: null,
                siteSettings: null,
                appContext: 'none'
            },

            init: function() {

                if (!initPromise) {
                    var deferred = $q.defer();
                    initPromise = deferred.promise;

                    // grab our global settings
                    service.refreshSiteSettings();

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
                service.model.siteSettings = null;

                // clear any existing session cookies if they exist
                ipCookie.remove('metabase.SESSION_ID');
            },

            refreshCurrentUser: function() {

                // this is meant to be called once on app startup
                var userRefresh = User.current(function(result) {
                    service.model.currentUser = result;

                    $rootScope.$broadcast('appstate:user', result);

                }, function(error) {
                    console.log('unable to get current user', error);
                });

                // NOTE: every time we refresh the user we update our current promise to ensure that
                //       we can guarantee we've resolved the current user
                currentUserPromise = userRefresh.$promise;

                return currentUserPromise;
            },

            refreshSiteSettings: function() {

                var settingsRefresh = Session.properties(function(result) {

                    var settings = _.indexBy(result, 'key');

                    service.model.siteSettings = settings;

                    $rootScope.$broadcast('appstate:site-settings', settings);

                }, function(error) {
                    console.log('unable to get site settings', error);
                });

                return settingsRefresh.$promise;
            },

            // This function performs whatever state cleanup and next steps are required when a user tries to access
            // something they are not allowed to.
            invalidAccess: function(user, url, message) {
                $location.path('/unauthorized/');
            },

            setAppContext: function(appContext) {
                service.model.appContext = appContext;
                $rootScope.$broadcast('appstate:context-changed', service.model.appContext);
            },

            routeChanged: function(event) {
                // establish our application context based on the route (URI)
                // valid app contexts are: 'setup', 'auth', 'main', 'admin', or 'unknown'
                var routeContext;
                if ($location.path().indexOf('/auth/') === 0) {
                    routeContext = 'auth';
                } else if ($location.path().indexOf('/setup/') === 0) {
                    routeContext = 'setup';
                } else if ($location.path().indexOf('/admin/') === 0) {
                    routeContext = 'admin';
                } else {
                    routeContext = 'main';
                }

                // if the context of the app has changed due to this route change then send out an event
                if (service.model.appContext !== routeContext) {
                    service.setAppContext(routeContext);
                }

                // this code is here to ensure that we have resolved our currentUser BEFORE we execute any other
                // code meant to establish app context based on the current route
                if (currentUserPromise) {
                    currentUserPromise.then(function(user) {
                        service.routeChangedImpl(event);
                    }, function(error) {
                        service.routeChangedImpl(event);
                    });
                } else {
                    service.routeChangedImpl(event);
                }
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

                if ($location.path().indexOf('/admin/') === 0) {
                    // the user is trying to change to a superuser page
                    if (!service.model.currentUser.is_superuser) {
                        service.invalidAccess(service.model.currentUser, $location.url(), "user is not a superuser!!!");
                        return;
                    }

                }
            }
        };

        // listen for location changes and use that as a trigger for page view tracking
        $rootScope.$on('$locationChangeSuccess', function() {
            // NOTE: we are only taking the path right now to avoid accidentally grabbing sensitive data like table/field ids
            MetabaseAnalytics.trackPageView($location.path());
        });

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
        'name': 'Public (others can read)'
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
        id: 'timestamp_seconds',
        name: 'UNIX Timestamp (Seconds)'
    }, {
        id: 'timestamp_milliseconds',
        name: 'UNIX Timestamp (Milliseconds)'
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
    }, {
        'id': 'sensitive',
        'name': 'Sensitive Information'
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
    };

    // this just makes it easier to access the current user
    this.currentUser = User.current;

    // The various DB engines we support <3
    // TODO - this should probably come back from the API, no?
    //
    // NOTE:
    // A database's connection details is stored in a JSON map in the field database.details.
    //
    // ENGINE DICT FORMAT:
    // *  name         - human-facing name to use for this DB engine
    // *  fields       - array of available fields to display when a user adds/edits a DB of this type. Each field should be a dict of the format below:
    //
    // FIELD DICT FORMAT:
    // *  displayName          - user-facing name for the Field
    // *  fieldName            - name used for the field in a database details dict
    // *  transform            - function to apply to this value before passing to the API, such as 'parseInt'. (default: none)
    // *  placeholder          - placeholder value that should be used in text input for this field (default: none)
    // *  placeholderIsDefault - if true, use the value of 'placeholder' as the default value of this field if none is specified (default: false)
    //                           (if you set this, don't set 'required', or user will still have to add a value for the field)
    // *  required             - require the user to enter a value for this field? (default: false)
    // *  choices              - array of possible values for this field. If provided, display a button toggle instead of a text input.
    //                           Each choice should be a dict of the format below: (optional)
    //
    // CHOICE DICT FORMAT:
    // *  name            - User-facing name for the choice.
    // *  value           - Value to use for the choice in the database connection details dict.
    // *  selectionAccent - What accent type should be applied to the field when its value is chosen? Either 'active' (currently green), or 'danger' (currently red).
    this.ENGINES = {
        postgres: {
            name: 'Postgres',
            fields: [{
                displayName: "Host",
                fieldName: "host",
                type: "text",
                placeholder: "localhost",
                placeholderIsDefault: true
            }, {
                displayName: "Port",
                fieldName: "port",
                type: "text",
                transform: parseInt,
                placeholder: "5432",
                placeholderIsDefault: true
            }, {
                displayName: "Database name",
                fieldName: "dbname",
                type: "text",
                placeholder: "birds_of_the_world",
                required: true
            }, {
                displayName: "Database username",
                fieldName: "user",
                type: "text",
                placeholder: "What username do you use to login to the database?",
                required: true
            }, {
                displayName: "Database password",
                fieldName: "password",
                type: "password",
                placeholder: "*******"
            }, {
                displayName: "Use a secure connection (SSL)?",
                fieldName: "ssl",
                type: "select",
                choices: [{
                    name: 'Yes',
                    value: true,
                    selectionAccent: 'active'
                }, {
                    name: 'No',
                    value: false,
                    selectionAccent: 'danger'
                }]
            }]
        },
        h2: {
            name: 'H2',
            fields: [{
                displayName: "Connection String",
                fieldName: "db",
                type: "text",
                placeholder: "file:/Users/camsaul/bird_sightings/toucans;AUTO_SERVER=TRUE"
            }]
        },
        mongo: {
            name: 'MongoDB',
            fields: [{
                displayName: "Host",
                fieldName: "host",
                type: "text",
                placeholder: "localhost",
                placeholderIsDefault: true
            }, {
                displayName: "Port",
                fieldName: "port",
                type: "text",
                transform: parseInt,
                placeholder: "27017"
            }, {
                displayName: "Database name",
                fieldName: "dbname",
                type: "text",
                placeholder: "carrierPigeonDeliveries",
                required: true
            }, {
                displayName: "Database username",
                fieldName: "user",
                type: "text",
                placeholder: "What username do you use to login to the database?"
            }, {
                displayName: "Database password",
                fieldName: "pass",
                type: "password",
                placeholder: "******"
            }]
        }
    };

    // Prepare database details before being sent to the API.
    // This includes applying 'transform' functions and adding default values where applicable.
    this.prepareDatabaseDetails = function(details) {
        if (!details.engine) throw "Missing key 'engine' in database request details; please add this as API expects it in the request body.";

        // iterate over each field definition
        this.ENGINES[details.engine].fields.forEach(function(field) {
            var fieldName = field.fieldName;

            // set default value if applicable
            if (!details[fieldName] && field.placeholderIsDefault) {
                details[fieldName] = field.placeholder;
            }

            // apply transformation function if applicable
            if (details[fieldName] && field.transform) {
                details[fieldName] = field.transform(details[fieldName]);
            }
        });

        return details;
    };
}]);


// User Services
var CoreServices = angular.module('corvus.core.services', ['ngResource', 'ngCookies']);

CoreServices.factory('Session', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/session/', {}, {
        create: {
            method: 'POST',
            ignoreAuthModule: true // this ensures a 401 response doesn't trigger another auth-required event
        },
        delete: {
            method: 'DELETE'
        },
        properties: {
            url: '/api/session/properties',
            method: 'GET',
            isArray: true
        },
        forgot_password: {
            url: '/api/session/forgot_password',
            method: 'POST'
        },
        reset_password: {
            url: '/api/session/reset_password',
            method: 'POST'
        }
    });
}]);

CoreServices.factory('User', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/user/:userId', {}, {
        create: {
            url: '/api/user',
            method: 'POST'
        },
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
            }
        },
        update_password: {
            url: '/api/user/:userId/password',
            method: 'PUT',
            params: {
                'userId': '@id'
            }
        },
        delete: {
            method: 'DELETE',
            params: {
                'userId': '@userId'
            }
        }
    });
}]);

CoreServices.factory('Settings', ['$resource', function($resource) {
    return $resource('/api/setting', {}, {
        list: {
            url: '/api/setting',
            method: 'GET',
            isArray: true,
        },

        // POST endpoint handles create + update in this case
        put: {
            url: '/api/setting/:key',
            method: 'PUT',
            params: {
                key: '@key'
            }
        },

        delete: {
            url: '/api/setting/:key',
            method: 'DELETE',
            params: {
                key: '@key'
            }
        }
    });
}]);
