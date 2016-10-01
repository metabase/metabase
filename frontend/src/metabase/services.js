import 'angular-http-auth';

angular.module('metabase.services', ['metabase.core.services', 'http-auth-interceptor']);

// API Services
var CoreServices = angular.module('metabase.core.services', ['ngResource']);

CoreServices.factory('Activity', ['$resource', function($resource) {
    return $resource('/api/activity', {}, {
        list: {
            method: 'GET',
            isArray: true
        },
        recent_views: {
            url: '/api/activity/recent_views',
            method: 'GET',
            isArray: true
        }
    });
}]);

CoreServices.factory('Card', ['$resource', function($resource) {
    return $resource('/api/card/:cardId', {}, {
        list: {
            url: '/api/card',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/card',
            method: 'POST'
        },
        get: {
            method: 'GET',
            params: {
                cardId: '@cardId'
            }
        },
        update: {
            method: 'PUT',
            params: {
                cardId: '@id'
            }
        },
        delete: {
            method: 'DELETE',
            params: {
                cardId: '@cardId'
            }
        },
        query: {
            method: 'POST',
            url: '/api/card/:cardID/query',
            params: {
                cardID: '@cardID'
            },
            then: function(resolve) {
                // enable cancelling of the request using this technique:
                // http://www.nesterovsky-bros.com/weblog/2015/02/02/CancelAngularjsResourceRequest.aspx
                if (this.params) {
                    this.timeout = this.params.timeout;
                    delete this.params.timeout;
                }
                delete this.then;
                resolve(this);
            }
        },
        isfavorite: {
            url: '/api/card/:cardId/favorite',
            method: 'GET',
            params: {
                cardId: '@cardId'
            }
        },
        favorite: {
            url: '/api/card/:cardId/favorite',
            method: 'POST',
            params: {
                cardId: '@cardId'
            }
        },
        unfavorite: {
            url: '/api/card/:cardId/favorite',
            method: 'DELETE',
            params: {
                cardId: '@cardId'
            }
        },
        updateLabels: {
            url: '/api/card/:cardId/labels',
            method: 'POST',
            params: {
                cardId: '@cardId',
                label_ids: '@label_ids'
            }
        }
    });
}]);

CoreServices.factory('Dashboard', ['$resource', function($resource) {
    return $resource('/api/dashboard/:dashId', {}, {
        list: {
            url:'/api/dashboard',
            method:'GET',
            isArray:true
        },
        create: {
            url:'/api/dashboard',
            method:'POST'
        },
        get: {
            method:'GET',
            params:{dashId:'@dashId'},
        },
        update: {
            method:'PUT',
            params:{dashId:'@id'}
        },
        delete: {
            method:'DELETE',
            params:{dashId:'@dashId'}
        },
        addcard: {
            url:'/api/dashboard/:dashId/cards',
            method:'POST',
            params:{dashId:'@dashId'}
        },
        removecard: {
            url:'/api/dashboard/:dashId/cards',
            method:'DELETE',
            params:{dashId:'@dashId'}
        },
        reposition_cards: {
            url:'/api/dashboard/:dashId/cards',
            method:'PUT',
            params:{dashId:'@dashId'}
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

CoreServices.factory('Slack', ['$resource', function($resource) {
    return $resource('/api/slack', {}, {

        updateSettings: {
            url: '/api/slack/settings',
            method: 'PUT'
        }
    });
}]);

CoreServices.factory('Metabase', ['$resource', function($resource) {
    return $resource('/api/meta', {}, {
        db_list: {
            url: '/api/database/',
            method: 'GET',
            isArray: true
        },
        db_list_with_tables: {
            method: 'GET',
            url: '/api/database/',
            params: {
                include_tables: 'true'
            },
            isArray: true
        },
        db_create: {
            url: '/api/database/',
            method: 'POST'
        },
        db_add_sample_dataset: {
            url: '/api/database/sample_dataset',
            method: 'POST'
        },
        db_get: {
            url: '/api/database/:dbId',
            method: 'GET',
            params: {
                dbId: '@dbId'
            }
        },
        db_update: {
            url: '/api/database/:dbId',
            method: 'PUT',
            params: {
                dbId: '@id'
            }
        },
        db_delete: {
            url: '/api/database/:dbId',
            method: 'DELETE',
            params: {
                dbId: '@dbId'
            }
        },
        db_metadata: {
            url: '/api/database/:dbId/metadata',
            method: 'GET',
            params: {
                dbId: '@dbId'
            }
        },
        db_tables: {
            url: '/api/database/:dbId/tables',
            method: 'GET',
            params: {
                dbId: '@dbId'
            },
            isArray: true
        },
        db_fields: {
            url: '/api/database/:dbId/fields',
            method: 'GET',
            params: {
                dbId: '@dbId'
            },
            isArray: true
        },
        db_idfields: {
            url: '/api/database/:dbId/idfields',
            method: 'GET',
            params: {
                dbId: '@dbId'
            },
            isArray: true
        },
        db_autocomplete_suggestions: {
            url: '/api/database/:dbId/autocomplete_suggestions?prefix=:prefix',
            method: 'GET',
            params: {
                dbId: '@dbId'
            },
            isArray: true
        },
        db_sync_metadata: {
            url: '/api/database/:dbId/sync',
            method: 'POST',
            params: {
                dbId: '@dbId'
            }
        },
        table_list: {
            url: '/api/table/',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_get: {
            url: '/api/table/:tableId',
            method: 'GET',
            params: {
                tableId: '@tableId'
            }
        },
        table_update: {
            url: '/api/table/:tableId',
            method: 'PUT',
            params: {
                tableId: '@id'
            }
        },
        table_fields: {
            url: '/api/table/:tableId/fields',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_fks: {
            url: '/api/table/:tableId/fks',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_reorder_fields: {
            url: '/api/table/:tableId/reorder',
            method: 'POST',
            params: {
                tableId: '@tableId'
            }
        },
        table_query_metadata: {
            url: '/api/table/:tableId/query_metadata',
            method: 'GET',
            params: {
                dbId: '@tableId'
            }
        },
        table_sync_metadata: {
            url: '/api/table/:tableId/sync',
            method: 'POST',
            params: {
                tableId: '@tableId'
            }
        },
        field_get: {
            url: '/api/field/:fieldId',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            }
        },
        field_summary: {
            url: '/api/field/:fieldId/summary',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            },
            isArray: true
        },
        field_values: {
            url: '/api/field/:fieldId/values',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            }
        },
        field_value_map_update: {
            url: '/api/field/:fieldId/value_map_update',
            method: 'POST',
            params: {
                fieldId: '@fieldId'
            }
        },
        field_update: {
            url: '/api/field/:fieldId',
            method: 'PUT',
            params: {
                fieldId: '@id'
            }
        },
        dataset: {
            url: '/api/dataset',
            method: 'POST',
            then: function(resolve) {
                // enable cancelling of the request using this technique:
                // http://www.nesterovsky-bros.com/weblog/2015/02/02/CancelAngularjsResourceRequest.aspx
                if (this.params) {
                    this.timeout = this.params.timeout;
                    delete this.params.timeout;
                }
                delete this.then;
                resolve(this);
            }
        },
        dataset_duration: {
            url: '/api/dataset/duration',
            method: 'POST'
        }
    });
}]);

CoreServices.factory('Pulse', ['$resource', function($resource) {
    return $resource('/api/pulse/:pulseId', {}, {
        list: {
            url: '/api/pulse',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/pulse',
            method: 'POST'
        },
        get: {
            method: 'GET',
            params: { pulseId: '@pulseId' },
        },
        update: {
            method: 'PUT',
            params: { pulseId: '@id' }
        },
        delete: {
            method: 'DELETE',
            params: { pulseId: '@pulseId' }
        },
        test: {
            url: '/api/pulse/test',
            method: 'POST'
        },
        form_input: {
            url: '/api/pulse/form_input',
            method: 'GET',
        },
        preview_card: {
            url: '/api/pulse/preview_card_info/:id',
            params: { id: '@id' },
            method: 'GET',
        }
    });
}]);

CoreServices.factory('Segment', ['$resource', function($resource) {
    return $resource('/api/segment/:segmentId', {}, {
        list: {
            url: '/api/segment',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/segment',
            method: 'POST'
        },
        get: {
            method: 'GET',
            params: { segmentId: '@segmentId' },
        },
        update: {
            method: 'PUT',
            params: { segmentId: '@id' }
        },
        delete: {
            method: 'DELETE',
            params: { segmentId: '@segmentId' }
        }
    });
}]);

CoreServices.factory('Metric', ['$resource', function($resource) {
    return $resource('/api/metric/:metricId', {}, {
        list: {
            url: '/api/metric',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/metric',
            method: 'POST'
        },
        get: {
            method: 'GET',
            params: { metricId: '@metricId' },
        },
        update: {
            method: 'PUT',
            params: { metricId: '@id' }
        },
        update_important_fields: {
            url: '/api/metric/:metricId/important_fields',
            method: 'PUT',
            params: {
                metricId: '@metricId',
                important_field_ids: '@important_field_ids'
            }
        },
        delete: {
            method: 'DELETE',
            params: { metricId: '@metricId' }
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

// Revisions V2
CoreServices.factory('Revisions', ['$resource', function($resource) {
    return $resource('/api/:entity/:id/revisions', {}, {
        get: {
            method: 'GET',
            isArray: true,
            params: {
                'entity': '@entity',
                'id': '@id'
            }
        }
    });
}]);

CoreServices.factory('Label', ['$resource', function($resource) {
    return $resource('/api/label/:id', {}, {
        list: {
            url: '/api/label',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/label',
            method: 'POST'
        },
        update: {
            method: 'PUT',
            params: {
                id: '@id'
            }
        },
        delete: {
            method: 'DELETE',
            params: {
                id: '@id'
            }
        }
    });
}]);

CoreServices.factory('Session', ['$resource', function($resource) {
    return $resource('/api/session/', {}, {
        create: {
            method: 'POST',
            ignoreAuthModule: true // this ensures a 401 response doesn't trigger another auth-required event
        },
        createWithGoogleAuth: {
            url: '/api/session/google_auth',
            method: 'POST',
            ignoreAuthModule: true
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

CoreServices.factory('Settings', ['$resource', function($resource) {
    return $resource('/api/setting', {}, {
        list: {
            url: '/api/setting',
            method: 'GET',
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
        // set multiple values at once
        setAll: {
            url: '/api/setting/',
            method: 'PUT',
            isArray: true
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

CoreServices.factory('Permissions', ['$resource', function($resource) {
    return $resource('/api/permissions', {}, {
        groups: {
            method: 'GET',
            url: '/api/permissions/group',
            isArray: true
        },
        groupDetails: {
            method: 'GET',
            url: '/api/permissions/group/:id',
            params: {
                id: '@id'
            }
        },
        graph: {
            method: 'GET',
            url: '/api/permissions/graph'
        },
        updateGraph: {
            method: 'PUT',
            url: '/api/permissions/graph'
        },
        createGroup: {
            method: 'POST',
            url: '/api/permissions/group'
        },
        memberships: {
            method: 'GET',
            url: '/api/permissions/membership',
        },
        createMembership: {
            method: 'POST',
            url: '/api/permissions/membership',
            isArray: true
        },
        deleteMembership: {
            method: 'DELETE',
            url: '/api/permissions/membership/:id',
            params: {
                id: '@id'
            }
        },
        updateGroup: {
            method: 'PUT',
            url: '/api/permissions/group/:id',
            params: {
                id: '@id'
            }
        },
        deleteGroup: {
            method: 'DELETE',
            url: '/api/permissions/group/:id',
            params: {
                id: '@id'
            }
        }
    });
}]);

CoreServices.factory('GettingStarted', ['$resource', function($resource) {
    return $resource('/api/getting_started', {}, {
        get: {
            url: '/api/getting_started',
            method: 'GET'
        }
    });
}]);

CoreServices.factory('Setup', ['$resource', function($resource) {
    return $resource('/api/setup/', {}, {
        create: {
            method: 'POST'
        },
        validate_db: {
            url: '/api/setup/validate',
            method: 'POST'
        }
    });
}]);

CoreServices.factory('User', ['$resource', function($resource) {
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
        update_qbnewb: {
            url: '/api/user/:userId/qbnewb',
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

CoreServices.factory('Util', ['$resource', function($resource) {
    return $resource('/api/util/', {}, {
        password_check: {
            url: '/api/util/password_check',
            method: 'POST'
        }
    });
}]);
