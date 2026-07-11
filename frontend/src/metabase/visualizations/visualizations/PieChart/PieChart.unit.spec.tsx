import { renderWithProviders } from "__support__/ui";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { PieChart } from "./PieChart";

registerVisualizations();

// Regression witness for metabase#48207.
//
// The e2e repro asserted a browser geometry symptom (a truncated legend label,
// `offsetWidth < scrollWidth`). The root cause the fix addresses is a
// JS-computed value: the `legendTitles` array PieChart hands to the legend.
// When percentages are hidden, a visible slice must contribute a single-element
// `[label]` tuple. The bug returned `[label, undefined]`, whose stray second
// element reserved layout space and truncated the label. We capture the
// computed prop directly instead of measuring pixels.
const mockLegend: { titles: unknown } = { titles: undefined };

jest.mock("metabase/visualizations/components/ChartWithLegend", () => ({
  ChartWithLegend: (props: { legendTitles: unknown }) => {
    mockLegend.titles = props.legendTitles;
    return null;
  },
}));

const dimension = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});
const metric = createMockColumn({
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  semantic_type: "type/Quantity",
});

function setup(percentVisibility: "off" | "legend"): unknown[] {
  mockLegend.titles = undefined;

  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        id: 1,
        display: "pie",
        visualization_settings: {
          "pie.dimension": ["CATEGORY"],
          "pie.metric": "count",
          "pie.percent_visibility": percentVisibility,
        },
      }),
      data: createMockDatasetData({
        cols: [dimension, metric],
        rows: [
          ["Doohickey", 42],
          ["Gadget", 30],
          ["Gizmo", 51],
          ["Widget", 20],
        ],
      }),
    },
  ];

  const settings = getComputedSettingsForSeries(rawSeries);

  const props = {
    rawSeries,
    settings,
    card: rawSeries[0].card,
    fontFamily: "Lato",
    width: 500,
    height: 300,
    onRender: jest.fn(),
    onRenderError: jest.fn(),
    onHoverChange: jest.fn(),
    hovered: undefined,
    isFullscreen: false,
    isDashboard: false,
    isDocument: false,
  } as any;

  renderWithProviders(<PieChart {...props} />);

  return mockLegend.titles as unknown[];
}

describe("PieChart legend titles (metabase#48207)", () => {
  it("omits the percentage entry entirely when percentages are hidden", () => {
    const legendTitles = setup("off");

    // Single-element `[label]` tuples — no trailing `undefined`.
    expect(legendTitles).toStrictEqual([
      ["Gizmo"],
      ["Doohickey"],
      ["Gadget"],
      ["Widget"],
    ]);
  });

  it("includes the formatted percentage when percentages show in the legend", () => {
    const legendTitles = setup("legend");

    expect(legendTitles).toStrictEqual([
      ["Gizmo", "35.7%"],
      ["Doohickey", "29.4%"],
      ["Gadget", "21.0%"],
      ["Widget", "14.0%"],
    ]);
  });
});
