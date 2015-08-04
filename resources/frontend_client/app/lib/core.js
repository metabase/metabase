'use strict';
/*global _, exports*/

(function() {

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
        'name': 'Information',
        'description': 'Non-numerical value that is not meant to be used'
    }, {
        'id': 'metric',
        'name': 'Metric',
        'description': 'A number that can be added, graphed, etc.'
    }, {
        'id': 'dimension',
        'name': 'Dimension',
        'description': 'A high or low-cardinality numerical string value that is meant to be used as a grouping'
    }, {
        'id': 'sensitive',
        'name': 'Sensitive Information',
        'description': 'A Fields that should never be shown anywhere'
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

}).apply(exports);
