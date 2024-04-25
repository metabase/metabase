import { render, screen } from "@testing-library/react";

import CategoricalDonutChart from "./CategoricalDonutChart";

const data = [
  ["donut", 2000],
  ["cronut", 3100],
];
const colors = {
  donut: "#509EE3",
  cronut: "#DDECFA",
};
const settings = {
  metric: {
    number_style: "currency",
    currency: "USD",
    currency_style: "symbol",
  },
};

describe("CategoricalDonutChart", () => {
  it("should apply formatting", () => {
    render(
      <CategoricalDonutChart data={data} colors={colors} settings={settings} />,
    );

    expect(screen.getByText("$5,100.00")).toBeInTheDocument();
    expect(screen.getAllByText("TOTAL")).toHaveLength(2);
  });

  it("should render data labels when percent_visibility=inside", () => {
    render(
      <CategoricalDonutChart
        data={data}
        colors={colors}
        settings={{ percent_visibility: "inside" }}
      />,
    );
    expect(screen.getByText("39.22 %")).toBeInTheDocument();
    expect(screen.getByText("60.78 %")).toBeInTheDocument();
  });

  it("should render data labels when percent_visibility is `off` or `legend`", () => {
    render(
      <>
        <CategoricalDonutChart
          data={data}
          colors={colors}
          settings={{ percent_visibility: "off" }}
        />
        <CategoricalDonutChart
          data={data}
          colors={colors}
          settings={{ percent_visibility: "legend" }}
        />
      </>,
    );
    expect(screen.queryByText("60.78 %")).not.toBeInTheDocument();
  });
});
