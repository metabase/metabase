import { renderWithProviders, screen } from "__support__/ui";
import { delay } from "__support__/utils";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { getColorShades } from "metabase/ui/utils/colors";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import Visualization from ".";

registerVisualizations();

// This test renders a real chart (ECharts + ExplicitSize), whose layout relies
// on genuine timers (setTimeout-on-mount, lodash throttle) and async settling.
// The fast-test regime's fake timers would stall `delay(0)`, so opt back into
// real timers — the subject is chart rendering, not timer behaviour.
beforeEach(() => {
  jest.useRealTimers();
});

describe("Themed Visualization", () => {
  it("inherits the chart label color from the theme", async () => {
    const TEST_COLOR = "rgb(44, 55, 66)";

    // Unjustified type cast. FIXME
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
