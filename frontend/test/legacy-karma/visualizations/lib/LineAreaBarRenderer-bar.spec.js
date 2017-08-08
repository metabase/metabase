
import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { NumberColumn, StringColumn, dispatchUIEvent } from "../../support/visualizations";

const DEFAULT_SETTINGS = {
    "graph.x_axis.scale": "ordinal",
    "graph.y_axis.scale": "linear",
    "graph.x_axis.axis_enabled": true,
    "graph.y_axis.axis_enabled": true,
    "graph.colors": ["#00FF00", "#FF0000"]
};

describe("LineAreaBarRenderer-bar", () => {
    let element;
    const qsa = (selector) => [...element.querySelectorAll(selector)];

    beforeEach(function() {
        document.body.insertAdjacentHTML('afterbegin', '<div id="fixture" style="height: 800px; width: 1200px;">');
        element = document.getElementById('fixture');
    });

    afterEach(function() {
        document.body.removeChild(document.getElementById('fixture'));
    });

    ["area", "bar"].forEach(chartType =>
        ["stacked", null].forEach(stack_type =>
            it("should render a " + (stack_type || "") + " " + chartType + " chart with 2 series", function(done) {
                let hoverCount = 0;
                lineAreaBarRenderer(element, {
                    chartType: chartType,
                    series: [{
                        card: {},
                        data: {
                            "cols" : [StringColumn({ display_name: "Category", source: "breakout" }), NumberColumn({ display_name: "Sum", source: "aggregation" }) ],
                            "rows" : [["A", 1]]
                        }
                    },{
                        card: {},
                        data: {
                            "cols" : [StringColumn({ display_name: "Category", source: "breakout" }), NumberColumn({ display_name: "Count", source: "aggregation" })],
                            "rows" : [["A", 2]]
                        }
                    }],
                    settings: {
                        ...DEFAULT_SETTINGS,
                        "stackable.stack_type": stack_type
                    },
                    onHoverChange: (hover) => {
                        const data = hover.data && hover.data.map(({ key, value }) => ({ key, value }));
                        hoverCount++;
                        if (hoverCount === 1) {
                            expect(data).toEqual([
                                { key: "Category", value: "A" },
                                { key: "Sum", value: 1 }
                            ]);
                            dispatchUIEvent(qsa("svg .bar, svg .dot")[1], "mousemove");
                        } else if (hoverCount === 2) {
                            expect(data).toEqual([
                                { key: "Category", value: "A" },
                                { key: "Count", value: 2 }
                            ]);
                            done()
                        }
                    }
                });
                dispatchUIEvent(qsa("svg .bar, svg .dot")[0], "mousemove");
            })
        )
    )
});
