import { renderWithProviders, screen } from "__support__/ui";
import { delay } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { getColorShades } from "metabase/ui/utils/colors";
import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import type { Series } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import Visualization from ".";

// @ts-expect-error: registerVisualization is not in TypeScript yet
registerVisualization(BarChart);

describe("Themed Visualization", () => {
  it("inherits the chart label color from the theme", async () => {
    const TEST_COLOR = "rgb(44, 55, 66)";

    const series = [
      {
        card: createMockCard({ name: "Card", display: "bar" }),
        data: {
          cols: [StringColumn({ name: "Foo" }), NumberColumn({ name: "Bar" })],
          rows: [["Baz", 1]],
        },
      },
    ] as Series;

    renderWithProviders(<Visualization rawSeries={series} />, {
      theme: { colors: { "text-primary": getColorShades(TEST_COLOR) } },
    });

    await delay(0);
    expect(screen.getByText("Foo")).toHaveAttribute("fill", TEST_COLOR);
    expect(screen.getByText("Baz")).toHaveAttribute("fill", TEST_COLOR);
  });
});
