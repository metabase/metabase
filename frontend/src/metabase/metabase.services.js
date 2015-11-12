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
            }
        },
        validate_connection: {
            url: '/api/database/validate/',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            },
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
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
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        field_update: {
            url: '/api/field/:fieldId',
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
        field_foreignkeys: {
            url: '/api/field/:fieldId/foreignkeys',
            method: 'GET',
            params: {
                fieldId: '@fieldId'
            },
            isArray: true
        },
        field_addfk: {
            url: '/api/field/:fieldId/foreignkeys',
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
    return $resource('/api/foreignkey/:fkID', {}, {
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
