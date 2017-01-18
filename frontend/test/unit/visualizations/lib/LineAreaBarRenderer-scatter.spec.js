
import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { NumberColumn, dispatchUIEvent } from "../../support/visualizations";

const DEFAULT_SETTINGS = {
    "graph.x_axis.scale": "linear",
    "graph.y_axis.scale": "linear",
    "graph.x_axis.axis_enabled": true,
    "graph.y_axis.axis_enabled": true,
    "graph.colors": ["#000000"]
};

describe("LineAreaBarRenderer-scatter", () => {
    let element;
    const qsa = (selector) => [...element.querySelectorAll(selector)];

    beforeEach(function() {
        document.body.insertAdjacentHTML('afterbegin', '<div id="fixture" style="height: 800px; width: 1200px;">');
        element = document.getElementById('fixture');
    });

    afterEach(function() {
        document.body.removeChild(document.getElementById('fixture'));
    });

    it("should render a scatter chart with 2 dimensions", function(done) {
        lineAreaBarRenderer(element, {
            chartType: "scatter",
            series: [{
                data: {
                    "cols" : [NumberColumn({ display_name: "A", source: "breakout" }), NumberColumn({ display_name: "B", source: "breakout" })],
                    "rows" : [[1,2]]
                }
            }],
            settings: DEFAULT_SETTINGS,
            onHoverChange: (hover) => {
                expect(hover.data.length).toBe(2);
                expect(hover.data[0].key).toBe("A")
                expect(hover.data[0].value).toBe(1)
                expect(hover.data[1].key).toBe("B")
                expect(hover.data[1].value).toBe(2)
                done()
            }
        });
        dispatchUIEvent(qsa("svg .bubble")[0], "mousemove");
    });

    it("should render a scatter chart with 2 dimensions and 1 metric", function(done) {
        lineAreaBarRenderer(element, {
            chartType: "scatter",
            series: [{
                data: {
                    "cols" : [
                        NumberColumn({ display_name: "A", source: "breakout" }),
                        NumberColumn({ display_name: "B", source: "breakout" }),
                        NumberColumn({ display_name: "C", source: "aggregation" })
                    ],
                    "rows" : [[1,2,3]]
                }
            }],
            settings: DEFAULT_SETTINGS,
            onHoverChange: (hover) => {
                expect(hover.data.length).toBe(3);
                expect(hover.data[0].key).toBe("A")
                expect(hover.data[0].value).toBe(1)
                expect(hover.data[1].key).toBe("B")
                expect(hover.data[1].value).toBe(2)
                expect(hover.data[2].key).toBe("C")
                expect(hover.data[2].value).toBe(3)
                done()
            }
        });
        dispatchUIEvent(qsa("svg .bubble")[0], "mousemove");
    });
});
