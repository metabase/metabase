import { renderWithProviders, screen } from "__support__/ui";
import { NumberColumn, StringColumn } from "__support__/visualizations";
import { delay } from "metabase/lib/promise";
import registerVisualizations from "metabase/visualizations/register";
import { createMockCard } from "metabase-types/api/mocks";

import Visualization from ".";

registerVisualizations();

describe("Themed Visualization", () => {
  const TEST_COLOR = "rgb(44, 55, 66)";

  const renderViz = async (series: any) => {
    renderWithProviders(<Visualization rawSeries={series} />, {
      theme: { colors: { "text-dark": [TEST_COLOR] } },
    });

    // The chart isn't rendered until the next tick. This is due to ExplicitSize
    // not setting the dimensions until after mounting.
    await delay(0);
  };

  it("inherits the chart labels from the theme", async () => {
    await renderViz([
      {
        card: createMockCard({ name: "Card", display: "bar" }),
        data: {
          cols: [StringColumn({ name: "Foo" }), NumberColumn({ name: "Bar" })],
          rows: [["Baz", 1]],
        },
      },
    ]);

    expect(screen.getByText("Foo")).toHaveAttribute("fill", TEST_COLOR);
    expect(screen.getByText("Baz")).toHaveAttribute("fill", TEST_COLOR);
  });
});
