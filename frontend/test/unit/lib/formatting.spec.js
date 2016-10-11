import { formatNumber, formatValue } from 'metabase/lib/formatting';
import { TYPE } from "metabase/lib/types";

describe('formatting', () => {
    describe('formatNumber', () => {
        it('should format 0 correctly', () => {
            expect(formatNumber(0)).toEqual("0");
        });
        it('should format 1 and -1 correctly', () => {
            expect(formatNumber(1)).toEqual("1");
            expect(formatNumber(-1)).toEqual("-1");
        });
        it('should format large positive and negative numbers correctly', () => {
            expect(formatNumber(10)).toEqual("10");
            expect(formatNumber(99999999)).toEqual("99,999,999");
            expect(formatNumber(-10)).toEqual("-10");
            expect(formatNumber(-99999999)).toEqual("-99,999,999");
        });
        it('should format to 2 significant digits', () => {
            expect(formatNumber(1/3)).toEqual("0.33");
            expect(formatNumber(-1/3)).toEqual("-0.33");
            expect(formatNumber(0.0001/3)).toEqual("0.000033");
        });
    });

    describe("formatValue", () => {
        it("should format numbers with null column", () => {
            expect(formatValue(12345)).toEqual("12345");
        });
        it("should format numbers with commas", () => {
            expect(formatValue(12345, { column: { base_type: TYPE.Number, special_type: TYPE.Number }})).toEqual("12,345");
        });
        it("should format zip codes without commas", () => {
            expect(formatValue(12345, { column: { base_type: TYPE.Number, special_type: TYPE.ZipCode }})).toEqual("12345");
        });
        it("should format latitude and longitude columns correctly", () => {
            expect(formatValue(37.7749, { column: { base_type: TYPE.Number, special_type: TYPE.Latitude }})).toEqual("37.77490000");
            expect(formatValue(-122.4194, { column: { base_type: TYPE.Number, special_type: TYPE.Longitude }})).toEqual("-122.41940000");
        });
    });
});
