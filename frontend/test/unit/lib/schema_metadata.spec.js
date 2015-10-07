/*eslint-env jasmine */

import {
    parseBaseType,
    parseSpecialType,
    getUmbrellaType,
    TIME,
    STRING,
    NUMBER,
    BOOL,
    LOCATION
} from 'metabase/lib/schema_metadata';

/* i'm a pretend latitude field */
const specialField = {
    base_type: 'FloatField',
    special_type: 'latitude'
}

describe('schema_metadata', () => {

    describe('parseBaseType', () => {
        it('should know a date', () => {
            expect(parseBaseType('DateField')).toEqual(TIME)
            expect(parseBaseType('DateTimeField')).toEqual(TIME)
            expect(parseBaseType('TimeField')).toEqual(TIME)
        });
        it('should know a number', () => {
            expect(parseBaseType('BigIntegerField')).toEqual(NUMBER)
            expect(parseBaseType('IntegerField')).toEqual(NUMBER)
            expect(parseBaseType('FloatField')).toEqual(NUMBER)
            expect(parseBaseType('DecimalField')).toEqual(NUMBER)
        });
        it('should know a string', () => {
            expect(parseBaseType('CharField')).toEqual(STRING)
            expect(parseBaseType('TextField')).toEqual(STRING)
        });
        it('should know a bool', () => {
            expect(parseBaseType('BooleanField')).toEqual(BOOL)
        });
        it('should know what it doesn\'t know', () => {
            expect(parseBaseType('DERP DERP DERP')).toEqual(undefined)
        });
    });

    describe('parseSpecialType', () => {
        it('should know a date', () => {
            expect(parseSpecialType('timestamp_seconds')).toEqual(TIME)
            expect(parseSpecialType('timestamp_milliseconds')).toEqual(TIME)
        });
        it('should know a location', () => {
            expect(parseSpecialType('city')).toEqual(LOCATION)
            expect(parseSpecialType('country')).toEqual(LOCATION)
            expect(parseSpecialType('latitude')).toEqual(LOCATION)
            expect(parseSpecialType('longitude')).toEqual(LOCATION)
        });
    });

    describe('getUmbrellaType', () => {
        it('should parse a special type if both types are present', () => {
            expect(getUmbrellaType(specialField)).toEqual(LOCATION)
        });
    });
});
