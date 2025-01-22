import { render, screen } from "@testing-library/react";

import MiniBar from "metabase/visualizations/components/MiniBar";

describe("MiniBar", () => {
  it("should use 1 as reference max for percent columns with values between 0 and 1", () => {
    const options = {
      show_mini_bar: true,
      number_style: "percent",
    };
    render(<MiniBar value={0.4} extent={[0.1, 0.8]} options={options} />);
    const miniBar = screen.getByTestId("mini-bar");
    expect(miniBar).toHaveStyle({ width: "40%" });
  });

  it("should use max value as reference max for decimal columns", () => {
    const options = {
      show_mini_bar: true,
      number_style: "decimal",
    };
    render(<MiniBar value={0.8} extent={[0.1, 0.8]} options={options} />);
    const miniBar = screen.getByTestId("mini-bar");
    expect(miniBar).toHaveStyle({ width: "100%" });
  });
});
