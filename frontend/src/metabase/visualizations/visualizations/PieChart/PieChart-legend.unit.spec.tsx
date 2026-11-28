import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { createMockColumn } from "metabase-types/api/mocks";

import {
  createMetricColumn,
  createSeries,
  setupChart,
} from "../CartesianChart/tests/test-utils";

registerVisualizations();

// Every state but Texas, Montana and Minnesota has under 4% of the orders, so
// they make up the "Other" slice
const OTHER_STATES = Array.from({ length: 30 }, (_, index) => [
  `S${index}`,
  index === 0 ? 533 : 525,
]);
const COUNT_BY_STATE = createSeries({
  display: "pie",
  cols: [
    createMockColumn({
      name: "STATE",
      display_name: "User → State",
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: "type/State",
      source: "breakout",
    }),
    createMetricColumn("count", "Count", "type/BigInteger"),
  ],
  rows: [["TX", 1342], ["MT", 872], ["MN", 788], ...OTHER_STATES],
  settings: {
    "pie.dimension": "STATE",
    "pie.metric": "count",
    "pie.slice_threshold": 4,
  },
});

/** The legend item of a slice. The chart renders the legend twice. */
function getLegendItem(name: string) {
  return screen.getAllByTestId(`legend-item-${name}`)[0];
}

async function toggleSlice(name: string, label: "Hide series" | "Show series") {
  await userEvent.click(
    within(getLegendItem(name)).getByRole("button", { name: label }),
  );
}

function getSlices(chart: HTMLElement) {
  return chart.querySelectorAll("path[stroke-linejoin='bevel']");
}

describe("PieChart legend", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hides and shows slices, and leaves them out of the total and the percentages", async () => {
    const chart = await setupChart({
      rawSeries: [COUNT_BY_STATE],
      canToggleSeriesVisibility: true,
    });
    await waitFor(() => expect(getSlices(chart)).toHaveLength(4));
    expect(within(chart).getByText("18,760")).toBeInTheDocument();
    expect(getLegendItem("TX")).toHaveTextContent(/^TX7\.15%$/);

    await toggleSlice("TX", "Hide series");
    await waitFor(() => expect(getSlices(chart)).toHaveLength(3));
    expect(within(chart).queryByText("18,760")).not.toBeInTheDocument();
    expect(within(chart).getByText("17,418")).toBeInTheDocument();
    // a hidden slice has no percentage
    expect(getLegendItem("TX")).toHaveTextContent(/^TX$/);

    await toggleSlice("Other", "Hide series");
    await waitFor(() => expect(getSlices(chart)).toHaveLength(2));
    expect(within(chart).queryByText("17,418")).not.toBeInTheDocument();
    expect(within(chart).getByText("1,660")).toBeInTheDocument();
    expect(getLegendItem("Other")).toHaveTextContent(/^Other$/);
    expect(getLegendItem("MT")).toHaveTextContent(/^MT52\.5%$/);
    expect(getLegendItem("MN")).toHaveTextContent(/^MN47\.5%$/);

    await toggleSlice("TX", "Show series");
    await waitFor(() => expect(getSlices(chart)).toHaveLength(3));
    expect(getLegendItem("TX")).toHaveTextContent(/^TX44\.7%$/);
  });
});
