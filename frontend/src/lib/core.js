/*global exports*/

import _ from "underscore";

(function() {

    this.user_roles = [{
        'id': 'user',
        'name': 'User',
        'description': 'Can do everything except access the Admin Panel.'
    }, {
        'id': 'admin',
        'name': 'Admin',
        'description': "Can access the Admin Panel to add or remove users and modify database settings."
    }];

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
        'id': 'id',
        'name': 'Entity Key',
        'section': 'Overall Row',
        'description': 'The primary key for this table.'
    }, {
        'id': 'name',
        'name': 'Entity Name',
        'section': 'Overall Row',
        'description': 'The "name" of each record. Usually a column called "name", "title", etc.'
    }, {
        'id': 'fk',
        'name': 'Foreign Key',
        'section': 'Overall Row',
        'description': 'Points to another table to make a connection.'
    }, {
        'id': 'avatar',
        'name': 'Avatar Image URL',
        'section': 'Common'
    }, {
        'id': 'category',
        'name': 'Category',
        'section': 'Common'
    }, {
        'id': 'city',
        'name': 'City',
        'section': 'Common'
    }, {
        'id': 'country',
        'name': 'Country',
        'section': 'Common'
    }, {
        'id': 'desc',
        'name': 'Description',
        'section': 'Common'
    }, {
        'id': 'image',
        'name': 'Image URL',
        'section': 'Common'
    }, {
        'id': 'json',
        'name': 'Field containing JSON',
        'section': 'Common'
    }, {
        'id': 'latitude',
        'name': 'Latitude',
        'section': 'Common'
    }, {
        'id': 'longitude',
        'name': 'Longitude',
        'section': 'Common'
    }, {
        'id': 'number',
        'name': 'Number',
        'section': 'Common'
    }, {
        'id': 'state',
        'name': 'State',
        'section': 'Common'
    }, {
        id: 'timestamp_seconds',
        name: 'UNIX Timestamp (Seconds)',
        'section': 'Common'
    }, {
        id: 'timestamp_milliseconds',
        name: 'UNIX Timestamp (Milliseconds)',
        'section': 'Common'
    }, {
        'id': 'url',
        'name': 'URL',
        'section': 'Common'
    }, {
        'id': 'zip_code',
        'name': 'Zip Code',
        'section': 'Common'
    }];

    this.field_field_types = [{
        'id': 'info',
        'name': 'Information',
        'description': 'Non-numerical value that is not meant to be used.'
    }, {
        'id': 'metric',
        'name': 'Metric',
        'description': 'A number that can be added, graphed, etc.'
    }, {
        'id': 'dimension',
        'name': 'Dimension',
        'description': 'A high or low-cardinality numerical string value that is meant to be used as a grouping.'
    }, {
        'id': 'sensitive',
        'name': 'Sensitive Information',
        'description': 'A field that should never be shown anywhere.'
    }];

    this.field_visibility_types = [{
        'id': 'everywhere',
        'name': 'Everywhere',
        'description': 'The default setting.  This field will be displayed normally in tables and charts.'
    }, {
        'id': 'detail_views',
        'name': 'Only in Detail Views',
        'description': "This field will only be displayed when viewing the details of a single record. Use this for information that's lengthy or that isn't useful in a table or chart."
    }, {
        'id': 'do_not_include',
        'name': 'Do Not Include',
        'description': 'Metabase will never retrieve this field. Use this for sensitive or irrelevant information.'
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

}).apply(exports);
