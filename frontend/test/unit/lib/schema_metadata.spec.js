/*eslint-env jasmine */

import {
    getFieldType,
    DATE_TIME,
    STRING,
    NUMBER,
    BOOLEAN,
    LOCATION,
    COORDINATE,
    foreignKeyCountsByOriginTable
} from 'metabase/lib/schema_metadata';

describe('schema_metadata', () => {
    describe('getFieldType', () => {
        it('should know a date', () => {
            expect(getFieldType({ base_type: 'DateField' })).toEqual(DATE_TIME)
            expect(getFieldType({ base_type: 'DateTimeField' })).toEqual(DATE_TIME)
            expect(getFieldType({ base_type: 'TimeField' })).toEqual(DATE_TIME)
            expect(getFieldType({ special_type: 'timestamp_seconds' })).toEqual(DATE_TIME)
            expect(getFieldType({ special_type: 'timestamp_milliseconds' })).toEqual(DATE_TIME)
        });
        it('should know a number', () => {
            expect(getFieldType({ base_type: 'BigIntegerField' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'IntegerField' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'FloatField' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'DecimalField' })).toEqual(NUMBER)
        });
        it('should know a string', () => {
            expect(getFieldType({ base_type: 'CharField' })).toEqual(STRING)
            expect(getFieldType({ base_type: 'TextField' })).toEqual(STRING)
        });
        it('should know a bool', () => {
            expect(getFieldType({ base_type: 'BooleanField' })).toEqual(BOOLEAN)
        });
        it('should know a location', () => {
            expect(getFieldType({ special_type: 'city' })).toEqual(LOCATION)
            expect(getFieldType({ special_type: 'country' })).toEqual(LOCATION)
        });
        it('should know a coordinate', () => {
            expect(getFieldType({ special_type: 'latitude' })).toEqual(COORDINATE)
            expect(getFieldType({ special_type: 'longitude' })).toEqual(COORDINATE)
        });
        it('should know what it doesn\'t know', () => {
            expect(getFieldType({ base_type: 'DERP DERP DERP' })).toEqual(undefined)
        });
    });

    describe('foreignKeyCountsByOriginTable', () => {
        it('should work with null input', () => {
            expect(foreignKeyCountsByOriginTable(null)).toEqual(null)
        });
        it('should require an array as input', () => {
            expect(foreignKeyCountsByOriginTable({})).toEqual(null)
        });
        it('should count occurrences by origin.table.id', () => {
            expect(foreignKeyCountsByOriginTable([{ origin: {table: {id: 123}} }, { origin: {table: {id: 123}} }, { origin: {table: {id: 123}} }, { origin: {table: {id: 456}} }])).toEqual({123: 3, 456: 1})
        });
    });
});
