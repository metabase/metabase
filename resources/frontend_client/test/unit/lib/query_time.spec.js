'use strict';
/*eslint-env jasmine */

import moment from "moment";

import { expandTimeIntervalFilter, computeFilterTimeRange, absolute } from 'metabase/lib/query_time';

describe('query_time', () => {
    describe('expandTimeIntervalFilter', () => {
        it('translate ["current" "month"] correctly', () => {
            expect(
                JSON.stringify(expandTimeIntervalFilter(["TIME_INTERVAL", 100, "current", "month"]))
            ).toBe(
                JSON.stringify(["=", ["datetime_field", 100, "as", "month"], ["relative_datetime", "current"]])
            );
        });
        it('translate [-30, "day"] correctly', () => {
            expect(
                JSON.stringify(expandTimeIntervalFilter(["TIME_INTERVAL", 100, -30, "day"]))
            ).toBe(
                JSON.stringify(["BETWEEN", ["datetime_field", 100, "as", "day"], ["relative_datetime", -31, "day"], ["relative_datetime", -1, "day"]])
            );
        });
    });

    describe('absolute', () => {
        it ('should pass through absolute dates', () => {
            expect(absolute("2009-08-07T06:05:04Z").format("YYYY-MM-DD HH:mm:ss")).toBe("2009-08-07 06:05:04");
        });

        it ('should convert relative_datetime "current"', () => {
            expect(absolute(["relative_datetime", "current"]).format("YYYY-MM-DD HH")).toBe(moment.utc().format("YYYY-MM-DD HH"));
        });

        it ('should convert relative_datetime -1 "month"', () => {
            expect(absolute(["relative_datetime", -1, "month"]).format("YYYY-MM-DD HH")).toBe(moment.utc().subtract(1, "month").format("YYYY-MM-DD HH"));
        });
    });

    describe('computeFilterTimeRange', () => {
        describe('absolute dates', () => {
            it ('should handle "="', () => {
                let [start, end] = computeFilterTimeRange(["=", 1, "2009-08-07"]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual("2009-08-07 00:00:00");
                expect(end).toEqual(null);
            });
            it ('should handle "<"', () => {
                let [start, end] = computeFilterTimeRange(["<", 1, "2009-08-07"]);
                expect(start.year()).toBeLessThan(-10000);
                expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual("2009-08-07 00:00:00");
            });
            it ('should handle ">"', () => {
                let [start, end] = computeFilterTimeRange([">", 1, "2009-08-07"]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual("2009-08-07 00:00:00");
                expect(end.year()).toBeGreaterThan(10000);
            });
            it ('should handle "BETWEEN"', () => {
                let [start, end] = computeFilterTimeRange(["BETWEEN", 1, "2009-08-07", "2009-08-09"]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual("2009-08-07 00:00:00");
                expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual("2009-08-09 00:00:00");
            });
        })

        describe('relative dates', () => {
            it ('should handle "="', () => {
                let [start, end] = computeFilterTimeRange(["=", 1, ["relative_datetime", "current"]]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().format("YYYY-MM-DD 00:00:00"));
                expect(end).toEqual(null);
            });
            it ('should handle "<"', () => {
                let [start, end] = computeFilterTimeRange(["<", 1, ["relative_datetime", "current"]]);
                expect(start.year()).toBeLessThan(-10000);
                expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().format("YYYY-MM-DD 00:00:00"));
            });
            it ('should handle ">"', () => {
                let [start, end] = computeFilterTimeRange([">", 1, ["relative_datetime", "current"]]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().format("YYYY-MM-DD 00:00:00"));
                expect(end.year()).toBeGreaterThan(10000);
            });
            it ('should handle "BETWEEN"', () => {
                let [start, end] = computeFilterTimeRange(["BETWEEN", 1, ["relative_datetime", -1, "day"], ["relative_datetime", 1, "day"]]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().subtract(1, "day").format("YYYY-MM-DD 00:00:00"));
                expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().add(1, "day").format("YYYY-MM-DD 00:00:00"));
            });
        });

        describe('TIME_INTERVAL', () => {
            it ('should handle "Past x days"', () => {
                let [start, end] = computeFilterTimeRange(["TIME_INTERVAL", 1, -7, "day"]);
                expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().subtract(8, "day").format("YYYY-MM-DD 00:00:00"));
                expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().subtract(1, "day").format("YYYY-MM-DD 00:00:00"));
            });
            // it ('should handle "last week"', () => {
            //     let [start, end] = computeFilterTimeRange(["TIME_INTERVAL", 1, "last", "week"]);
            //     expect(start.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().subtract(1, "week").format("YYYY-MM-DD 00:00:00"));
            //     expect(end.format("YYYY-MM-DD HH:mm:ss")).toEqual(moment.utc().subtract(1, "day").format("YYYY-MM-DD 00:00:00"));
            // });
        });
    });
});
