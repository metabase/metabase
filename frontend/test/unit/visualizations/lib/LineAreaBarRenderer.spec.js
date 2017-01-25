
import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";
import { formatValue } from "metabase/lib/formatting";

import d3 from "d3";

import { DateTimeColumn, NumberColumn } from "../../support/visualizations";

let formatTz = (offset) => (offset < 0 ? "-" : "+") + d3.format("02d")(Math.abs(offset)) + ":00"

const BROWSER_TZ = formatTz(- new Date().getTimezoneOffset() / 60);
const ALL_TZS = d3.range(-1, 2).map(formatTz);


describe("LineAreaBarRenderer", () => {
    let element;

    beforeEach(function() {
        document.body.insertAdjacentHTML('afterbegin', '<div id="fixture" style="height: 800px; width: 1200px;">');
        element = document.getElementById('fixture');
    });

    afterEach(function() {
        document.body.removeChild(document.getElementById('fixture'));
    });

    it("should display numeric year in X-axis and tooltip correctly", (done) => {
        renderTimeseriesLine({
            rows: [
                [2015, 1],
                [2016, 2],
                [2017, 3]
            ],
            unit: "year",
            onHoverChange: (hover) => {
                expect(formatValue(hover.data[0].value, { column: hover.data[0].col })).toEqual(
                    "2015"
                );
                expect(qsa("svg .axis.x .tick text").map(e => e.textContent)).toEqual([
                    "2015",
                    "2016",
                    "2017"
                ]);
                done();
            }
        });
        dispatchUIEvent(qs("svg .dot"), "mousemove");
    });

    ["Z", ...ALL_TZS].forEach(tz =>
        it("should display hourly data (in " + tz + " timezone) in X axis and tooltip consistently", (done) => {
            let rows = [
                ["2016-10-03T20:00:00.000" + tz, 1],
                ["2016-10-03T21:00:00.000" + tz, 1],
            ];
            renderTimeseriesLine({
                rows,
                unit: "hour",
                onHoverChange: (hover) => {
                    let expected = rows.map(row => formatValue(row[0], { column: DateTimeColumn({ unit: "hour" }) }));
                    expect(formatValue(hover.data[0].value, { column: hover.data[0].col })).toEqual(
                        expected[0]
                    );
                    expect(qsa("svg .axis.x .tick text").map(e => e.textContent)).toEqual(expected);
                    done();
                }
            })
            dispatchUIEvent(qs("svg .dot"), "mousemove");
        })
    )

    it("should display hourly data (in the browser's timezone) in X axis and tooltip consistently and correctly", function(done) {
        let tz = BROWSER_TZ;
        let rows = [
            ["2016-01-01T01:00:00.000" + tz, 1],
            ["2016-01-01T02:00:00.000" + tz, 1],
            ["2016-01-01T03:00:00.000" + tz, 1],
            ["2016-01-01T04:00:00.000" + tz, 1]
        ];
        renderTimeseriesLine({
            rows,
            unit: "hour",
            onHoverChange: (hover) => {
                expect(formatValue(rows[0][0], { column: DateTimeColumn({ unit: "hour" }) })).toEqual(
                    '1 AM - January 1, 2016'
                )
                expect(formatValue(hover.data[0].value, { column: hover.data[0].col })).toEqual(
                    '1 AM - January 1, 2016'
                );
                expect(qsa("svg .axis.x .tick text").map(e => e.textContent)).toEqual([
                    '1 AM - January 1, 2016',
                    '2 AM - January 1, 2016',
                    '3 AM - January 1, 2016',
                    '4 AM - January 1, 2016'
                ]);
                done();
            }
        });
        dispatchUIEvent(qs("svg .dot"), "mousemove");
    });

    // querySelector shortcut
    const qs = (selector) => element.querySelector(selector);

    // querySelectorAll shortcut, casts to Array
    const qsa = (selector) => [...element.querySelectorAll(selector)];

    // helper for timeseries line charts
    const renderTimeseriesLine = ({ rows, onHoverChange, unit }) => {
        lineAreaBarRenderer(element, {
            chartType: "line",
            series: [{
                data: {
                    "cols" : [DateTimeColumn({ unit }), NumberColumn()],
                    "rows" : rows
                }
            }],
            settings: {
                "graph.x_axis.scale": "timeseries",
                "graph.x_axis.axis_enabled": true,
                "graph.colors": ["#000000"]
            },
            onHoverChange
        });
    }
});

function dispatchUIEvent(element, eventName) {
    let e = document.createEvent("UIEvents");
    e.initUIEvent(eventName, true, true, window, 1);
    element.dispatchEvent(e);
}
