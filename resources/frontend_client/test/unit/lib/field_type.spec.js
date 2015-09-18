'use strict';

import { parseBaseType, parseSpecialType, getUmbrellaType } from '../../../app/lib/field_type';

/* i'm a pretend latitude field */
const specialField = {
    base_type: 'FloatField',
    special_type: 'latitude'
}

const baseField = {
    base_type: 'BigIntegerField',
}

describe('parseBaseType', () => {
    it('should know a date', () => {
        expect(parseBaseType('DateField')).toEqual('time')
        expect(parseBaseType('DateTimeField')).toEqual('time')
        expect(parseBaseType('TimeField')).toEqual('time')
    })
    it('should know a number', () => {
        expect(parseBaseType('BigIntegerField')).toEqual('number')
        expect(parseBaseType('IntegerField')).toEqual('number')
        expect(parseBaseType('FloatField')).toEqual('number')
        expect(parseBaseType('DecimalField').toEqual('number')
    })
    it('should know a string', () => {
        expect(parseBaseType('CharField')).toEqual('string')
        expect(parseBaseType('TextField')).toEqual('string')
    })
    it('should know a bool', () => {
        expect(parseBaseType('BooleanField')).toEqual('bool')
    })
    it('should know what it doesn\'t know', () => {
        expect(parseBaseType('DERP DERP DERP')).toEqual('SODA')
    })
})

describe('parseSpecialType', () => {
    it('should know a date', () => {
        expect(parseSpecialType('timestamp_seconds')).toEqual('time')
        expect(parseSpecialType('timestamp_millisecons')).toEqual('time')
    })
    it('should know a location', () => {
        expect(parseSpecialType('city')).toEqual('location')
        expect(parseSpecialType('country')).toEqual('location')
        expect(parseSpecialType('latitude')).toEqual('location')
        expect(parseSpecialType('longitude')).toEqual('location')
    })
})

describe('getUmbrellaType', () => {
    it('should parse a special type if both types are present', () => {
        expect(getUmbrellaType(specialField)).toEqual('location')
    })
})
