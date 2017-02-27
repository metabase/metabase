
// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations";

import { getSettings } from 'metabase/visualizations/lib/settings';

import { DateTimeColumn, NumberColumn } from "../../support/visualizations";

describe('visualization_settings', () => {
    describe('getSettings', () => {
        it("should default to unstacked stacked", () => {
            const settings = getSettings([{
                card: {
                    display: "area",
                    visualization_settings: {}
                },
                data: {
                    cols: [DateTimeColumn({ unit: "month" }), NumberColumn()]
                }
            }])
            expect(settings["stackable.stack_type"]).toBe(null);
        })
        it("should default area chart to stacked for 1 dimensions and 2 metrics", () => {
            const settings = getSettings([{
                card: {
                    display: "area",
                    visualization_settings: {}
                },
                data: {
                    cols: [DateTimeColumn({ unit: "month" }), NumberColumn(), NumberColumn()]
                }
            }])
            expect(settings["stackable.stack_type"]).toBe("stacked");
        })
    });
});
