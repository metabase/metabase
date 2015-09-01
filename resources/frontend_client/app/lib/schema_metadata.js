'use strict';

import _ from "underscore";


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

var SchemaMetadata = {

    isDateType: function(field) {
        return isInTypes(field.base_type, DateBaseTypes) || isInTypes(field.special_type, DateSpecialTypes);
    },

    isNumericType: function(field) {
        return isInTypes(field.base_type, NumberBaseTypes);
    },

    isSummableType: function(field) {
        return isInTypes(field.base_type, SummableBaseTypes);
    },

    isCategoryType: function(field) {
        return isInTypes(field.base_type, CategoryBaseTypes) || isInTypes(field.special_type, CategorySpecialTypes);
    },

    isDimension: function(field) {
        return SchemaMetadata.isDateType(field) || SchemaMetadata.isCategoryType(field) || isInTypes(field.field_type, ['dimension']);
    }
};


export default SchemaMetadata;
