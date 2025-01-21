/* eslint-disable testing-library/no-node-access */
import { render, screen } from "@testing-library/react";

import MiniBar from "metabase/visualizations/components/MiniBar";

const _MINIBAR_OPTIONS = {
  column_title: "C2",
  show_mini_bar: true,
  view_as: "auto",
  currency: "USD",
  currency_style: "symbol",
  currency_in_header: true,
  number_separators: ".,",
  _numberFormatter: "NumberFormat",
  column: '{base_type: "type/Decimal", database_type: "NUMERIC…}',
  _column_title_full: "C2",
};

describe("MiniBar", () => {
  it("should use 1 as reference max for percent columns with values between 0 and 1", () => {
    const options = {
      ..._MINIBAR_OPTIONS,
      number_style: "percent",
    };
    render(<MiniBar value={0.4} extent={[0.1, 0.8]} options={options} />);
    const miniBar = screen.getByTestId("mini-bar");
    const progressBar = miniBar.children[0];
    expect(progressBar).toHaveStyle({ width: "40%" });
  });

  it("should use max value as reference max for decimal columns", () => {
    const options = {
      ..._MINIBAR_OPTIONS,
      number_style: "decimal",
    };
    render(<MiniBar value={0.8} extent={[0.1, 0.8]} options={options} />);
    const miniBar = screen.getByTestId("mini-bar");
    const progressBar = miniBar.children[0];
    expect(progressBar).toHaveStyle({ width: "100%" });
  });
});
