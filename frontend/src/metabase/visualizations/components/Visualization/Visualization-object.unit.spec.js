import { renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { StringColumn } from "__support__/visualizations";

function setup({ rows, longNameVisibility = "normal" }) {
  const cols = [
    StringColumn({ name: "Short name" }),
    StringColumn({ name: "Long name", visibility_type: longNameVisibility }),
  ];
  const series = [
    {
      card: {
        display: "object",
      },
      data: { rows, cols },
    },
  ];

  renderWithProviders(<Visualization rawSeries={series} />);
}

describe("visualization - object", () => {
  it("render fields with 'visibility_type' set as 'details-only'", () => {
    const rows = [["John", "John Smith Jr"]];

    setup({ rows, longNameVisibility: "details-only" });

    expect(screen.getByText("Long name")).toBeInTheDocument();
    expect(screen.getByText("John Smith Jr")).toBeInTheDocument();
  });
});
