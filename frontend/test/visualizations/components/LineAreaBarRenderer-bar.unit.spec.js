import "__support__/mocks"; // included explicitly whereas with integrated tests it comes with __support__/integrated_tests

import {
  NumberColumn,
  StringColumn,
  dispatchUIEvent,
  renderLineAreaBar,
} from "../__support__/visualizations";

const DEFAULT_SETTINGS = {
  "graph.x_axis.scale": "ordinal",
  "graph.y_axis.scale": "linear",
  "graph.x_axis.axis_enabled": true,
  "graph.y_axis.axis_enabled": true,
  "graph.colors": ["#00FF00", "#FF0000"],
  series: () => ({ display: "bar" }),
  column: () => ({ date_style: "MMMM D, YYYY" }),
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
      it(`should render a ${stack_type ||
        ""} ${chartType} chart with 2 series`, () => {
        const onHoverChange = jest.fn();
        renderLineAreaBar(
          element,
          [
            {
              card: {
                display: chartType,
                visualization_settings: {
                  ...DEFAULT_SETTINGS,
                  "stackable.stack_type": stack_type,
                },
              },
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
          {
            onHoverChange,
          },
        );

        // hover over each bar
        dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
        dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");

        const { calls } = onHoverChange.mock;
        if (stack_type === "normalized") {
          expect(getDataKeyValues(calls[0][0])).toEqual([
            { key: "Category", value: "A" },
            { key: "% Sum", value: "33%" },
          ]);
          expect(getDataKeyValues(calls[1][0])).toEqual([
            { key: "Category", value: "A" },
            { key: "% Count", value: "67%" },
          ]);
        } else {
          expect(getDataKeyValues(calls[0][0])).toEqual([
            { key: "Category", value: "A" },
            { key: "Sum", value: 1 },
          ]);
          expect(getDataKeyValues(calls[1][0])).toEqual([
            { key: "Category", value: "A" },
            { key: "Count", value: 2 },
          ]);
        }
      }),
    ),
  );
});

function getDataKeyValues(hover) {
  return hover.data.map(({ key, value }) => ({ key, value }));
}
