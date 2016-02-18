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
            expect(getFieldType({ base_type: 'type/datetime.date' })).toEqual(DATE_TIME)
            expect(getFieldType({ base_type: 'type/datetime' })).toEqual(DATE_TIME)
            expect(getFieldType({ base_type: 'type/datetime.time' })).toEqual(DATE_TIME)
            expect(getFieldType({ special_type: 'type/datetime.unix.seconds' })).toEqual(DATE_TIME)
            expect(getFieldType({ special_type: 'type/datetime.unix.milliseconds' })).toEqual(DATE_TIME)
        });
        it('should know a number', () => {
            expect(getFieldType({ base_type: 'type/number.integer.big' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'type/number.integer' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'type/number.float' })).toEqual(NUMBER)
            expect(getFieldType({ base_type: 'type/number.float.decimal' })).toEqual(NUMBER)
        });
        it('should know a string', () => {
            expect(getFieldType({ base_type: 'type/text' })).toEqual(STRING)
            expect(getFieldType({ base_type: 'type/text' })).toEqual(STRING)
        });
        it('should know a bool', () => {
            expect(getFieldType({ base_type: 'type/boolean' })).toEqual(BOOLEAN)
        });
        it('should know a location', () => {
            expect(getFieldType({ special_type: 'type/text.geo.city' })).toEqual(LOCATION)
            expect(getFieldType({ special_type: 'type/text.geo.country' })).toEqual(LOCATION)
        });
        it('should know a coordinate', () => {
            expect(getFieldType({ special_type: 'type/number.float.coordinate.latitude' })).toEqual(COORDINATE)
            expect(getFieldType({ special_type: 'type/number.float.coordinate.longitude' })).toEqual(COORDINATE)
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
