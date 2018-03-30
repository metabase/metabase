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

const WIDTH = 1200;
const HEIGHT = 800;

describe("LineAreaBarRenderer-bar", () => {
  let element;
  const qsa = selector => [...element.querySelectorAll(selector)];

  beforeEach(function() {
    document.body.style.width = `${WIDTH}px`;
    document.body.style.height = `${WIDTH}px`;
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="fixture" style="height: ${HEIGHT}px; width: ${WIDTH}px;">`,
    );
    element = document.getElementById("fixture");
  });

  afterEach(function() {
    document.body.removeChild(document.getElementById("fixture"));
  });

  describe("with 2 series", () => {
    ["area", "bar"].forEach(chartType =>
      ["stacked", "normalized"].forEach(stackType =>
        it(`should render a ${stackType} ${chartType} chart`, () => {
          const onHoverChange = jest.fn();
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
              "stackable.stack_type": stackType,
            },
            onHoverChange,
          });

          expect(onHoverChange).toHaveBeenCalledTimes(0);
          dispatchUIEvent(qsa(".bar, .dot")[0], "mousemove");
          expect(onHoverChange).toHaveBeenCalledTimes(1);
          dispatchUIEvent(qsa(".bar, .dot")[1], "mousemove");
          expect(onHoverChange).toHaveBeenCalledTimes(2);

          const NORMALIZED_DATA = [
            [{ key: "Category", value: "A" }, { key: "% Sum", value: "33%" }],
            [{ key: "Category", value: "A" }, { key: "% Count", value: "67%" }],
          ];
          const STACKED_DATA = [
            [{ key: "Category", value: "A" }, { key: "Sum", value: 1 }],
            [{ key: "Category", value: "A" }, { key: "Count", value: 2 }],
          ];

          expect(
            onHoverChange.mock.calls.map(call =>
              call[0].data.map(({ key, value }) => ({ key, value })),
            ),
          ).toEqual(
            stackType === "normalized" ? NORMALIZED_DATA : STACKED_DATA,
          );
        }),
      ),
    );
  });
});
