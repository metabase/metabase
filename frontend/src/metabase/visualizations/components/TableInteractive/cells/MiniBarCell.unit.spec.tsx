import { render, screen } from "@testing-library/react";

import { MiniBarCell } from "./MiniBarCell";

describe("MiniBarCell", () => {
  const formatter = (value: unknown) => String(value);
  const rowIndex = 1;
  const columnId = "foo";

  it("should use 1 as reference max for percent columns with values between 0 and 1", () => {
    const columnSettings = {
      show_mini_bar: true,
      number_style: "percent",
    };
    render(
      <MiniBarCell
        rowIndex={rowIndex}
        columnId={columnId}
        formatter={formatter}
        value={0.4}
        extent={[0.1, 0.8]}
        columnSettings={columnSettings}
      />,
    );
    const miniBar = screen.getByTestId("mini-bar");
    expect(miniBar).toHaveStyle({ width: "40%" });
  });

  it("should use max value as reference max for decimal columns", () => {
    const columnSettings = {
      show_mini_bar: true,
      number_style: "decimal",
    };
    render(
      <MiniBarCell
        formatter={formatter}
        value={0.8}
        extent={[0.1, 0.8]}
        columnSettings={columnSettings}
        rowIndex={rowIndex}
        columnId={columnId}
      />,
    );
    const miniBar = screen.getByTestId("mini-bar");
    expect(miniBar).toHaveStyle({ width: "100%" });
  });
});
