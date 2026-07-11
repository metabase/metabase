import { render, screen } from "__support__/ui";
import { LegendHorizontal } from "metabase/visualizations/components/LegendHorizontal";

describe("LegendHorizontal", () => {
  it("should render titles correctly", () => {
    render(<LegendHorizontal titles={["Hello", "World"]} colors={["red"]} />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("should render without crashing when hiddenIndices is undefined (metabase#48519)", () => {
    render(
      <LegendHorizontal
        titles={["Hello", "World"]}
        colors={["red"]}
        hiddenIndices={undefined}
      />,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });
});
