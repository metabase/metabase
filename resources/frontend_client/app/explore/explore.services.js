'use strict';
/*global _*/
var ExploreServices = angular.module('corvus.explore.services', []);

ExploreServices.service('CorvusFormGenerator', [function() {
    // Valid Operators per field

    var DateBaseTypes = ['DateTimeField', 'DateField'];
    var DateSpecialTypes = ['timestamp_milliseconds', 'timestamp_seconds'];
    var NumberBaseTypes = ['IntegerField', 'DecimalField', 'FloatField', 'BigIntegerField'];
    var SummableBaseTypes = ['IntegerField', 'DecimalField', 'FloatField', 'BigIntegerField'];
    var CategoryBaseTypes = ["BooleanField"];
    var CategorySpecialTypes = ["category", "zip_code", "city", "state", "country"];

    function isInTypes(type, type_collection) {
        if (_.indexOf(type_collection, type) >= 0) {
            return true;
        }
        return false;

    }

    function isDate(field) {
        return isInTypes(field.base_type, DateBaseTypes) || isInTypes(field.special_type, DateSpecialTypes);
    }

    function isNumber(field) {
        return isInTypes(field.base_type, NumberBaseTypes);
    }

    function isSummable(field) {
        return isInTypes(field.base_type, SummableBaseTypes);
    }

    function isCategory(field) {
        return isInTypes(field.base_type, CategoryBaseTypes) || isInTypes(field.special_type, CategorySpecialTypes);
    }

    function isDimension(field) {
        return isDate(field) || isCategory(field) || isInTypes(field.field_type, ['dimension']);
    }


    function freeformArgument(field, table) {
        return {
            'type': "text"
        };
    }


    function numberArgument(field, table) {
        return {
            'type': "number"
        };
    }


    function comparableArgument(field, table) {

        var inputType = "text";
        if (isNumber(field)) {
            inputType = "number";
        }
        if (isDate(field)) {
            inputType = "date";
        }
        return {
            'type': inputType
        };
    }


    function equivalentArgument(field, table) {

        var input_type = "text";
        if (isDate(field)) {
            input_type = "date";
        }
        if (isNumber(field)) {
            input_type = "number";
        }

        if (isCategory(field)) {
            // DON'T UNDERSTAND WHY I HAVE TO DO THIS (!)
            if (!table.field_values) {
                table.field_values = {};
                for (var fld in table.fields) {
                    table.field_values[fld.id] = fld.name; // ???
                }
            }

            if (field.id in table.field_values && table.field_values[field.id].length > 0) {
                var valid_values = table.field_values[field.id];
                valid_values.sort();
                return {
                    "type": "select",
                    'values': _.map(valid_values, function(value) {
                        return {
                            'key': value,
                            'name': value
                        };
                    })
                };
            }
        }
        return {
            'type': input_type
        };
    }

    function longitudeFieldSelectArgument(field, table) {
        var longitudeFields = _.filter(table.fields, function(field) {
            return field.special_type == "longitude";
        });
        var validValues = _.map(longitudeFields, function(field) {
            return {
                'key': field.id,
                'name': field.name
            };
        });

        return {
            "values": validValues,
            "type": "select"
        };
    }

    var FilterOperators = {
        'IS': {
            'name': "=",
            'verbose_name': "Is",
            'validArgumentsFilters': [equivalentArgument]
        },
        'IS_NOT': {
            'name': "!=",
            'verbose_name': "Is Not",
            'validArgumentsFilters': [equivalentArgument]
        },
        'IS_NULL': {
            'name': "IS_NULL",
            'verbose_name': "Is Null",
            'validArgumentsFilters': []
        },
        'IS_NOT_NULL': {
            'name': "NOT_NULL",
            'verbose_name': "Is Not Null",
            'validArgumentsFilters': []
        },
        'LESS_THAN': {
            'name': "<",
            'verbose_name': "Less Than",
            'validArgumentsFilters': [comparableArgument]
        },
        'LESS_THAN_OR_EQUAL': {
            'name': "<=",
            'verbose_name': "Less Than or Equal To",
            'validArgumentsFilters': [comparableArgument]
        },
        'GREATER_THAN': {
            'name': ">",
            'verbose_name': "Greater Than",
            'validArgumentsFilters': [comparableArgument]
        },
        'GREATER_THAN_OR_EQUAL': {
            'name': ">=",
            'verbose_name': "Greater Than or Equal To",
            'validArgumentsFilters': [comparableArgument]
        },
        'IN': {
            'name': "IN",
            'verbose_name': "In - [list of values]",
            'validArgumentsFilters': [freeformArgument]
        },
        'INSIDE': {
            'name': "INSIDE",
            'verbose_name': "Inside - (Lat,Long) for upper left, (Lat,Long) for lower right",
            'validArgumentsFilters': [longitudeFieldSelectArgument, numberArgument, numberArgument, numberArgument, numberArgument]
        },
        'BETWEEN': {
            'name': "BETWEEN",
            'verbose_name': "Between - Min, Max",
            'validArgumentsFilters': [comparableArgument, comparableArgument]
        },
        'NEAR': {
            'name': "NEAR",
            'verbose_name': "Near - (Lat, Long), Max Distance",
            'validArgumentsFilters': [longitudeFieldSelectArgument, numberArgument, numberArgument, numberArgument]
        }
        // TODO - These are not yet implemented on the backend
        // Once we do that we should re-enable these
        // 'STARTS_WITH': {
        //     'name': "STARTS_WITH",
        //     'verbose_name': "Starts with - ",
        //     'validArgumentsFilters': [freeformArgument]
        // },
        // 'CONTAINS': {
        //     'name': "CONTAINS",
        //     'verbose_name': "Contains the substring - ",
        //     'validArgumentsFilters': [freeformArgument]
        // }
    };


    var BaseOperators = ['IS', 'IS_NOT', 'IS_NULL', 'IS_NOT_NULL'];

    var AdditionalOperators = {
        // 'CharField': ['STARTS_WITH', 'CONTAINS'],
        // 'TextField': ['STARTS_WITH', 'CONTAINS'],
        'IntegerField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'BigIntegerField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'DecimalField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'FloatField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'DateTimeField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'DateField': ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'BETWEEN'],
        'LatLongField': ['INSIDE', 'NEAR'],
        'latitude': ['INSIDE', 'NEAR']
    };

    function formatOperator(cls, field, table) {
        return {
            'name': cls.name,
            'verbose_name': cls.verbose_name,
            'validArgumentsFilters': cls.validArgumentsFilters,
            'fields': _.map(cls.validArgumentsFilters, function(validArgumentsFilter) {
                return validArgumentsFilter(field, table);
            })
        };
    }

    function getOperators(field, table) {
        // All fields have the base operators
        var validOperators = BaseOperators;

        // Check to see if the field's base type offers additional operators
        if (field.base_type in AdditionalOperators) {
            validOperators = validOperators.concat(AdditionalOperators[field.base_type]);
        }
        // Check to see if the field's semantic type offers additional operators
        if (field.special_type in AdditionalOperators) {
            validOperators = validOperators.concat(AdditionalOperators[field.special_type]);
        }
        // Wrap them up and send them back
        return _.map(validOperators, function(operator) {
            return formatOperator(FilterOperators[operator], field, table);
        });
    }

    // Breakouts and Aggregation options
    function shortenFields(fields) {
        return _.map(fields, function(field) {
            return [field.id, field.name];
        });

    }

    function allFields(fields) {
        return shortenFields(fields);
    }

    function summableFields(fields) {
        return shortenFields(_.filter(fields, isSummable));
    }

    function dimensionFields(fields) {
        return shortenFields(_.filter(fields, isDimension));
    }

    var Aggregators = [{
        "name": "Raw data",
        "short": "rows",
        "description": "Just a table with the rows in the answer, no additional operations.",
        "advanced": false,
        "validFieldsFilters": []
    }, {
        "name": "Count",
        "short": "count",
        "description": "Total number of rows in the answer.",
        "advanced": false,
        "validFieldsFilters": []
    }, {
        "name": "Sum",
        "short": "sum",
        "description": "Sum of all the values of a column.",
        "advanced": false,
        "validFieldsFilters": [summableFields]
    }, {
        "name": "Average",
        "short": "avg",
        "description": "Average of all the values of a column",
        "advanced": false,
        "validFieldsFilters": [summableFields]
    }, {
        "name": "Number of distinct values",
        "short": "distinct",
        "description":  "Number of unique values of a column among all the rows in the answer.",
        "advanced": true,
        "validFieldsFilters": [allFields]
    }, {
        "name": "Cumulative sum",
        "short": "cum_sum",
        "description": "Additive sum of all the values of a column.\ne.x. total revenue over time.",
        "advanced": true,
        "validFieldsFilters": [summableFields]
    }, {
        "name": "Standard deviation",
        "short": "stddev",
        "description": "Number which expresses how much the values of a colum vary among all rows in the answer.",
        "advanced": true,
        "validFieldsFilters": [summableFields]
    }, {
        name: "Sudoku",
        short: "sudoku",
        description: "Generate a new sudoku board.",
        advanced: true,
        validFieldsFilters: []
    }];

    var BreakoutAggregator = {
        "name": "Break out by dimension",
        "short": "breakout",
        "validFieldsFilters": [dimensionFields]
    };

    function populateFields(aggregator, fields) {
        return {
            'name': aggregator.name,
            'short': aggregator.short,
            'description': aggregator.description || '',
            'advanced': aggregator.advanced || false,
            'fields': _.map(aggregator.validFieldsFilters, function(validFieldsFilterFn) {
                return validFieldsFilterFn(fields);
            })
        };
    }

    function getAggregators(fields) {
        return _.map(Aggregators, function(aggregator) {
            return populateFields(aggregator, fields);
        });
    }

    function getBreakouts(fields) {
        var result = populateFields(BreakoutAggregator, fields);
        result.fields = result.fields[0];
        return result;
    }

    // Main entry function
    this.addValidOperatorsToFields = function(table) {
        _.each(table.fields, function(field) {
            field.valid_operators = getOperators(field, table);
        });
        table.aggregation_options = getAggregators(table.fields);
        table.breakout_options = getBreakouts(table.fields);
        return table;
    };

}]);
