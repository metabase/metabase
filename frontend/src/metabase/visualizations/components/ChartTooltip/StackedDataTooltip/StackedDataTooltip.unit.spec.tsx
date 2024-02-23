import { render, screen } from "@testing-library/react";
import _ from "underscore";

import type { StackedTooltipModel } from "metabase/visualizations/types";

import StackedDataTooltip from "./StackedDataTooltip";

const defaultHeaderRows = [
  {
    color: "red",
    name: "2020",
    value: 300,
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
    value: 100,
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
    expect(rowValues).toStrictEqual(["(300)", "_200_", "[100]"]);
  });

  it("does not percentages when showPercentages is falsy", () => {
    const { rowPercents } = setup();
    expect(rowPercents).toStrictEqual([]);
  });

  it("renders percentages when showPercentages=true", () => {
    const { rowPercents } = setup({ showPercentages: true });
    expect(rowPercents).toStrictEqual(["50.00 %", "33.33 %", "16.67 %"]);
  });

  it("renders the total row when showTotal=true", () => {
    const { rowNames, rowValues } = setup({ showTotal: true });
    expect(rowNames[rowNames.length - 1]).toBe("Total");
    expect(rowValues[rowValues.length - 1]).toBe("600");
  });

  it("groups excessive tooltip rows", () => {
    const bodyRows = _.range(10).map(rowNumber => ({
      color: "red",
      name: `body row ${rowNumber}`,
      value: rowNumber * 100,
    }));

    const { rowNames, rowValues } = setup({
      showTotal: true,
      headerRows: [],
      bodyRows,
    });

    expect(rowNames).toStrictEqual([
      "body row 9",
      "body row 8",
      "body row 7",
      "body row 6",
      "body row 5",
      "body row 4",
      "body row 3",
      "Other",
      "Total",
    ]);

    expect(rowValues).toStrictEqual([
      "900",
      "800",
      "700",
      "600",
      "500",
      "400",
      "300",
      "300",
      "4500",
    ]);
  });

  it("sorts rows by value from highest to lowest", () => {
    const unsortedRows = [
      {
        color: "red",
        name: "100",
        value: 100,
      },
      {
        color: "red",
        name: "null",
        value: null,
      },
      {
        color: "red",
        name: "50",
        value: 50,
      },
      {
        color: "red",
        name: "200",
        value: 200,
      },
    ];

    const { rowNames, rowValues } = setup({
      showTotal: true,
      headerRows: unsortedRows,
      bodyRows: unsortedRows,
    });

    expect(rowNames).toStrictEqual([
      // header
      "200",
      "100",
      "50",
      "null",
      // body
      "200",
      "100",
      "50",
      "null",
      // total
      "Total",
    ]);

    expect(rowValues).toStrictEqual([
      // header
      "200",
      "100",
      "50",
      "null",
      // body
      "200",
      "100",
      "50",
      "null",
      // total
      "700",
    ]);
  });
});
