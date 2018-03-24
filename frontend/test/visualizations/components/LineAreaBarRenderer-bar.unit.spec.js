import "__support__/mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";
import {
  NumberColumn,
  StringColumn,
  dispatchUIEvent,
} from "../__support__/visualizations";

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "ordinal",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#00FF00", "#FF0000"],
};

describe("LineAreaBarRenderer-bar", () => {
  let element;
  const qsa = selector => [...element.querySelectorAll(selector)];

  beforeEach(function() {
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div id="fixture" style="height: 800px; width: 1200px;">',
    );
    element = document.getElementById("fixture");
  });

  afterEach(function() {
    document.body.removeChild(document.getElementById("fixture"));
  });

  ["area", "bar"].forEach(chartType =>
    ["stacked", "normalized"].forEach(stack_type =>
      it(
        "should render a " +
          (stack_type || "") +
          " " +
          chartType +
          " chart with 2 series",
        function() {
          return new Promise((resolve, reject) => {
            let hoverCount = 0;
            lineAreaBarRenderer(element, {
              chartType: chartType,
              series: [
                {
                  card: {},
                  data: {
                    cols: [
                      StringColumn({
                        display_name: "Category",
                        source: "breakout",
                      }),
                      NumberColumn({
                        display_name: "Sum",
                        source: "aggregation",
                      }),
                    ],
                    rows: [["A", 1]],
                  },
                },
                {
                  card: {},
                  data: {
                    cols: [
                      StringColumn({
                        display_name: "Category",
                        source: "breakout",
                      }),
                      NumberColumn({
                        display_name: "Count",
                        source: "aggregation",
                      }),
                    ],
                    rows: [["A", 2]],
                  },
                },
              ],
              settings: {
                ...DEFAULT_SETTINGS,
                "stackable.stack_type": stack_type,
              },
              onHoverChange: hover => {
                try {
                  const data =
                    hover.data &&
                    hover.data.map(({ key, value }) => ({ key, value }));
                  let standardDisplay;
                  let normalizedDisplay;

                  hoverCount++;
                  if (hoverCount === 1) {
                    standardDisplay = [
                      { key: "Category", value: "A" },
                      { key: "Sum", value: 1 },
                    ];

                    normalizedDisplay = [
                      { key: "Category", value: "A" },
                      { key: "% Sum", value: "33%" },
                    ];

                    expect(data).toEqual(
                      stack_type === "normalized"
                        ? normalizedDisplay
                        : standardDisplay,
                    );
                    dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");
                  } else if (hoverCount === 2) {
                    standardDisplay = [
                      { key: "Category", value: "A" },
                      { key: "Count", value: 2 },
                    ];

                    normalizedDisplay = [
                      { key: "Category", value: "A" },
                      { key: "% Count", value: "67%" },
                    ];

                    expect(data).toEqual(
                      stack_type === "normalized"
                        ? normalizedDisplay
                        : standardDisplay,
                    );

                    resolve();
                  }
                } catch (e) {
                  reject(e);
                }
              },
            });
            dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
          });
        },
      ),
    ),
  );
});
