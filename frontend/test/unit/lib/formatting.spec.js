
import { isElementOfType } from "react-addons-test-utils";

import { formatNumber, formatValue, formatUrl } from 'metabase/lib/formatting';
import ExternalLink from "metabase/components/ExternalLink.jsx";
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
        describe("in compact mode", () => {
            it("should format 0 as 0", () => {
                expect(formatNumber(0, { compact: true })).toEqual("0");
            })
            it("shouldn't display small numbers as 0", () => {
                expect(formatNumber(0.1, { compact: true })).toEqual("0.1");
                expect(formatNumber(-0.1, { compact: true })).toEqual("-0.1");
                expect(formatNumber(0.01, { compact: true })).toEqual("~ 0");
                expect(formatNumber(-0.01, { compact: true })).toEqual("~ 0");
            });
            it("should format large numbers with metric units", () => {
                expect(formatNumber(1, { compact: true })).toEqual("1");
                expect(formatNumber(1000, { compact: true })).toEqual("1.0k");
                expect(formatNumber(1111, { compact: true })).toEqual("1.1k");
            })
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

    describe("formatUrl", () => {
        it("should return a string when not in jsx mode", () => {
            expect(formatUrl("http://metabase.com/")).toEqual("http://metabase.com/")
        });
        it("should return a component for http:, https:, and mailto: links in jsx mode", () => {
            expect(isElementOfType(formatUrl("http://metabase.com/", { jsx: true }), ExternalLink)).toEqual(true);
            expect(isElementOfType(formatUrl("https://metabase.com/", { jsx: true }), ExternalLink)).toEqual(true);
            expect(isElementOfType(formatUrl("mailto:tom@metabase.com", { jsx: true }), ExternalLink)).toEqual(true);
        });
        it("should return a string for javascript:, data:, and other links in jsx mode", () => {
            expect(formatUrl("javascript:alert('pwnd')", { jsx: true })).toEqual("javascript:alert('pwnd')");
            expect(formatUrl("data:text/plain;charset=utf-8,hello%20world", { jsx: true })).toEqual("data:text/plain;charset=utf-8,hello%20world");
        });
    })
});
