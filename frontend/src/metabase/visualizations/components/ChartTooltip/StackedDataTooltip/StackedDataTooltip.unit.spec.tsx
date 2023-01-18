import React from "react";
import { render, screen } from "@testing-library/react";

import type { StackedTooltipModel } from "../types";
import StackedDataTooltip from "./StackedDataTooltip";

const defaultHeaderRows = [
  {
    color: "red",
    name: "2020",
    value: 100,
    formatter: (value: unknown) => `(${value})`,
  },
];

const defaultBodyRows = [
  {
    color: "green",
    name: "2019",
    value: 200,
    formatter: (value: unknown) => `_${value}_`,
  },
  {
    color: "blue",
    name: "2018",
    value: 300,
    formatter: (value: unknown) => `[${value}]`,
  },
];

const setup = ({
  headerTitle = "header-title",
  headerRows = defaultHeaderRows,
  bodyRows = defaultBodyRows,
  ...rest
}: Partial<StackedTooltipModel> = {}) => {
  render(
    <StackedDataTooltip
      headerTitle={headerTitle}
      headerRows={headerRows}
      bodyRows={bodyRows}
      {...rest}
    />,
  );

  const header = screen.queryByTestId("tooltip-header");
  const rowNames = screen.queryAllByTestId("row-name").map(el => el.innerHTML);
  const rowValues = screen
    .queryAllByTestId("row-value")
    .map(el => el.innerHTML);
  const rowPercents = screen
    .queryAllByTestId("row-percent")
    .map(el => el.innerHTML);

  return {
    header,
    rowNames,
    rowValues,
    rowPercents,
  };
};

describe("StackedDataTooltip", () => {
  it("renders the header with formatted name—value pairs", () => {
    const { rowNames, rowValues, header } = setup();
    expect(header).toHaveTextContent("header-title");
    expect(rowNames).toStrictEqual(["2020", "2019", "2018"]);
    expect(rowValues).toStrictEqual(["(100)", "_200_", "[300]"]);
  });

  it("does not percentages when showPercentages is falsy", () => {
    const { rowPercents } = setup();
    expect(rowPercents).toStrictEqual([]);
  });

  it("renders percentages when showPercentages=true", () => {
    const { rowPercents } = setup({ showPercentages: true });
    expect(rowPercents).toStrictEqual(["16.67 %", "33.33 %", "50.00 %"]);
  });

  it("renders the total row when showTotal=true", () => {
    const { rowNames, rowValues } = setup({ showTotal: true });
    expect(rowNames[rowNames.length - 1]).toBe("Total");
    expect(rowValues[rowValues.length - 1]).toBe("600");
  });
});
