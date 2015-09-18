// create a standardized set of strings to return
const TIME = 'time';
const NUMBER = 'number';
const STRING = 'string';
const BOOL = 'bool';
const LOCATION = 'location';
const UNKNOWN = 'unknown';

// will return a string with possible values of'date', 'number', 'bool', 'string'
// if the type cannot be parsed, then return undefined
export function getUmbrellaType(field) {
    if(field.special_type) {
        return parseSpecialType(field.special_type);
    } else {
        return parseBaseType(field.base_type);
    }
}

export function parseBaseType(type) {
    switch(type) {
        case 'DateField':
        case 'DateTimeField':
        case 'TimeField':
            return TIME;
        case 'BigIntegerField':
        case 'IntegerField':
        case 'FloatField':
        case 'DecimalField':
            return NUMBER;
        case 'CharField':
        case 'TextField':
            return STRING;
        case 'BooleanField':
            return BOOL;
        default:
            return UNKNOWN;
    }
}

export function parseSpecialType(type) {
    switch(type) {
        case 'timestamp_millisecons':
        case 'timestamp_seconds':
            return TIME;
        case 'city':
        case 'country':
        case 'latitude':
        case 'longitude':
        case 'state':
        case 'zipcode':
            return LOCATION;
        case 'name':
            return STRING;
        case 'id':
            return NUMBER;
        default:
            return UNKNOWN;
    }
}
