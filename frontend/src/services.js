import _ from "underscore";

import MetabaseAnalytics from 'metabase/lib/analytics';
import MetabaseCookies from 'metabase/lib/cookies';
import MetabaseCore from 'metabase/lib/core';
import MetabaseSettings from 'metabase/lib/settings';


var MetabaseServices = angular.module('metabase.services', ['http-auth-interceptor', 'ipCookie', 'metabase.core.services']);

MetabaseServices.factory('AppState', ['$rootScope', '$q', '$location', '$interval', '$timeout', 'ipCookie', 'Session', 'User', 'Settings',
    function($rootScope, $q, $location, $interval, $timeout, ipCookie, Session, User, Settings) {
        // this is meant to be a global service used for keeping track of our overall app state
        // we fire 2 events as things change in the app
        // 1. appstate:user

        var initPromise;
        var currentUserPromise;

        var service = {

            model: {
                setupToken: null,
                currentUser: null,
                appContext: 'none',
                requestedUrl: null
            },

            init: function() {

                if (!initPromise) {
                    // hackery to allow MetabaseCookies to tie into Angular
                    MetabaseCookies.bootstrap($rootScope, $location, ipCookie);

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

                var settingsRefresh = Session.properties(function(settings) {

                    MetabaseSettings.setAll(_.omit(settings, function(value, key, object) {
                        return (key.indexOf('$') === 0);
                    }));

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
                } else if ($location.path() === '/') {
                    routeContext = 'home';
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

                // handle routing protections for /setup/
                if ($location.path().indexOf('/setup') === 0 && !MetabaseSettings.hasSetupToken()) {
                    // someone trying to access setup process without having a setup token, so block that.
                    $location.path('/');
                    return;
                } else if ($location.path().indexOf('/setup') !== 0 && MetabaseSettings.hasSetupToken()) {
                    // someone who has a setup token but isn't routing to setup yet, so send them there!
                    $location.path('/setup/');
                    return;
                }

                // if we don't have a current user then the only sensible destination is the login page
                if (!service.model.currentUser) {
                    // make sure we clear out any current state just to be safe
                    service.clearState();

                    if ($location.path().indexOf('/auth/') !== 0 && $location.path().indexOf('/setup/') !== 0) {
                        // if the user is asking for a url outside of /auth/* then record the url then send them
                        // to login page, otherwise we will let the user continue on to their requested page
                        service.model.requestedUrl = $location.path();
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
            },

            redirectAfterLogin: function() {
                if (service.model.requestedUrl) {
                    $location.path(service.model.requestedUrl);
                    delete service.model.requestedUrl;
                } else {
                    $location.path('/');
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

        // enable / disable GA based on opt-out of anonymous tracking
        $rootScope.$on("appstate:site-settings", function(event, settings) {
            const ga_code = MetabaseSettings.get('ga_code');
            if (MetabaseSettings.isTrackingEnabled()) {
                // we are doing tracking
                window['ga-disable-'+ga_code] = null;
            } else {
                // tracking is disabled
                window['ga-disable-'+ga_code] = true;
            }
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

MetabaseServices.service('MetabaseCore', ['User', function(User) {
    // this just makes it easier to access the current user
    this.currentUser = User.current;

    // copy over MetabaseCore properties and functions
    angular.forEach(MetabaseCore, (value, key) => this[key] = value);
}]);


// User Services
var CoreServices = angular.module('metabase.core.services', ['ngResource', 'ngCookies']);

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
            method: 'GET'
        },
        forgot_password: {
            url: '/api/session/forgot_password',
            method: 'POST'
        },
        reset_password: {
            url: '/api/session/reset_password',
            method: 'POST'
        },
        password_reset_token_valid: {
            url: '/api/session/password_reset_token_valid',
            method: 'GET'
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
        },
        send_invite: {
            url: '/api/user/:userId/send_invite',
            method: 'POST',
            params: {
                'userId': '@id'
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

        // set multiple values at once
        setAll: {
            url: '/api/setting/',
            method: 'PUT',
            isArray: true
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

CoreServices.factory('Email', ['$resource', function($resource) {
    return $resource('/api/email', {}, {

        updateSettings: {
            url: '/api/email/',
            method: 'PUT'
        },

        sendTest: {
            url: '/api/email/test',
            method: 'POST'
        }
    });
}]);

CoreServices.factory('Revision', ['$resource', function($resource) {
    return $resource('/api/revision', {}, {
        list: {
            url: '/api/revision',
            method: 'GET',
            isArray: true,
            params: {
                'entity': '@entity',
                'id': '@id'
            }
        },

        revert: {
            url: '/api/revision/revert',
            method: 'POST',
            params: {
                'entity': '@entity',
                'id': '@id',
                'revision_id': '@revision_id'
            }
        }
    });
}]);

CoreServices.factory('Util', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/util/', {}, {
        password_check: {
            url: '/api/util/password_check',
            method: 'POST'
        }
    });
}]);
