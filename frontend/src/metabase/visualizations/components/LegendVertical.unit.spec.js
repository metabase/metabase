import { render, screen } from "__support__/ui";
import { LegendVertical } from "metabase/visualizations/components/LegendVertical";

describe("LegendVertical", () => {
  it("should render string titles correctly", () => {
    render(<LegendVertical titles={["Hello"]} colors={["red"]} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("should render array titles correctly", () => {
    render(<LegendVertical titles={[["Hello", "world"]]} colors={["red"]} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });
});
