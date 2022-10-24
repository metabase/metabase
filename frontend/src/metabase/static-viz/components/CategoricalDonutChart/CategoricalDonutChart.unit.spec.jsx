import React from "react";
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

    screen.getByText("$5,100.00");
    screen.getAllByText("TOTAL");
  });

  it("should render data labels when show_labels=true", () => {
    render(
      <CategoricalDonutChart
        data={data}
        colors={colors}
        settings={{ show_values: true }}
      />,
    );
    screen.getByText("39.22 %");
    screen.getByText("60.78 %");
  });

  it("should render data labels when show_labels is falsy", () => {
    render(<CategoricalDonutChart data={data} colors={colors} />);
    expect(screen.queryByText("60.78 %")).not.toBeInTheDocument();
  });
});
