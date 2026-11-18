import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { ClickObject } from "metabase/visualizations/types";
import { createMockVisualizationProps } from "metabase/visualizations/types/mocks";
import type { ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { Gauge } from "./Gauge";

const CLICK_BEHAVIOR: ClickBehavior = {
  type: "link",
  linkType: "question",
  targetId: 10,
  parameterMapping: {},
};
const GAUGE_CARD = createMockCard({ display: "gauge" });

function setup() {
  const onVisualizationClick = jest.fn<void, [ClickObject | null]>();
  const series = createMockSingleSeries(GAUGE_CARD, {
    data: createMockDatasetData({
      cols: [
        createMockColumn({
          name: "count",
          base_type: "type/Integer",
          effective_type: "type/Integer",
        }),
      ],
      rows: [[1112]],
    }),
  });

  renderWithProviders(
    <Gauge
      {...createMockVisualizationProps({
        series: [series],
        rawSeries: [series],
        settings: {
          "gauge.range": [0, 2000],
          "gauge.segments": [
            { min: 0, max: 2000, color: "#84BB4C", label: "" },
          ],
          column: () => ({}),
          click_behavior: CLICK_BEHAVIOR,
        },
        visualizationIsClickable: () => true,
        onVisualizationClick,
      })}
    />,
  );

  return { onVisualizationClick };
}

// jsdom does not lay out SVG text, which the gauge measures to size its label
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => new DOMRect(0, 0, 10, 10),
  });
});

afterAll(() => {
  Reflect.deleteProperty(SVGElement.prototype, "getBBox");
});

describe("Gauge", () => {
  it("passes its click behavior settings on click, so a dashboard card can follow it (metabase#23137)", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(screen.getByTestId("gauge-arc-0"));

    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    const [clicked] = onVisualizationClick.mock.calls[0];
    expect(clicked?.settings?.click_behavior).toEqual(CLICK_BEHAVIOR);
  });
});
