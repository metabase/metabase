'use strict';

// Metabase Services
var MetabaseServices = angular.module('metabase.metabase.services', [
    'ngResource',
    'ngCookies',
    'metabase.services'
]);

MetabaseServices.factory('Metabase', ['$resource', '$cookies', 'MetabaseCore', function($resource, $cookies, MetabaseCore) {
    return $resource('/api/meta', {}, {
        db_form_input: {
            url: '/api/database/form_input',
            method: 'GET'
        },
        db_list: {
            url: '/api/database/?org=:orgId',
            method: 'GET',
            isArray: true
        },
        db_create: {
            url: '/api/database/',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
            transformRequest: function(data) {
                data = MetabaseCore.prepareDatabaseDetails(data);
                return angular.toJson(data);
            }
        },
        validate_connection: {
            url: '/api/database/validate/',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
            transformRequest: function(data) {
                data = MetabaseCore.prepareDatabaseDetails(data);
                return angular.toJson(data);
            }
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        db_delete: {
            url: '/api/database/:dbId',
            method: 'DELETE',
            params: {
                dbId: '@dbId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        table_list: {
            url: '/api/meta/table/',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_get: {
            url: '/api/meta/table/:tableId',
            method: 'GET',
            params: {
                tableId: '@tableId'
            }
        },
        table_update: {
            url: '/api/meta/table/:tableId',
            method: 'PUT',
            params: {
                tableId: '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        table_fields: {
            url: '/api/meta/table/:tableId/fields',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_fks: {
            url: '/api/meta/table/:tableId/fks',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_reorder_fields: {
            url: '/api/meta/table/:tableId/reorder',
            method: 'POST',
            params: {
                tableId: '@tableId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
        },
        table_segments: {
            url: '/api/meta/table/:tableId/segments',
            method: 'GET',
            params: {
                tableId: '@tableId'
            },
            isArray: true
        },
        table_createsegment: {
            url: '/api/meta/table/:tableId/segments',
            method: 'POST',
            params: {
                tableId: '@tableId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        table_dependents: {
            url: '/api/dependency/table/:tableId/dependents',
            method: 'GET',
            params: {
                tableId: '@tableId'
            }
        },
        table_query_metadata: {
            url: '/api/meta/table/:tableId/query_metadata',
            method: 'GET',
            params: {
                dbId: '@tableId'
            }
        },
        table_sync_metadata: {
            url: '/api/meta/table/:tableId/sync',
            method: 'POST',
            params: {
                tableId: '@tableId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        field_get: {
            url: '/api/meta/field/:fieldId',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            }
        },
        field_summary: {
            url: '/api/meta/field/:fieldId/summary',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            },
            isArray: true
        },
        field_values: {
            url: '/api/meta/field/:fieldId/values',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            }
        },
        field_value_map_update: {
            url: '/api/meta/field/:fieldId/value_map_update',
            method: 'POST',
            params: {
                fieldId: '@fieldId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        field_update: {
            url: '/api/meta/field/:fieldId',
            method: 'PUT',
            params: {
                fieldId: '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        field_pivots: {
            url: '/api/meta/field/:fieldId/pivots',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            },
            isArray: true
        },
        field_foreignkeys: {
            url: '/api/meta/field/:fieldId/foreignkeys',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            },
            isArray: true
        },
        field_addfk: {
            url: '/api/meta/field/:fieldId/foreignkeys',
            method: 'POST',
            params: {
                fieldId: '@fieldId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        metadata: {
            url: '/api/database/:dbId/metadata',
            method: 'GET',
            params: {
                dbId: '@dbId'
            }
        },
        dataset: {
            url: '/api/dataset',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        }
    });
}]);



MetabaseServices.factory('ForeignKey', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/meta/fk/:fkID', {}, {
        delete: {
            method: 'DELETE',
            params: {
                fkID: '@fkID'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
        },

    });
}]);

MetabaseServices.factory('TableSegment', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/meta/segment/:segmentID', {}, {
        delete: {
            method: 'DELETE',
            params: {
                segmentID: '@segmentID'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
        },

    });
}]);
