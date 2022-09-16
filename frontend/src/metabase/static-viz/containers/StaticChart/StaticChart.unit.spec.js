import React from "react";
import { render, screen } from "@testing-library/react";
import StaticChart from "./StaticChart";

describe("StaticChart", () => {
  it("should render categorical/donut", () => {
    render(
      <StaticChart
        type="categorical/donut"
        options={{
          data: [
            ["donut", 2000],
            ["cronut", 3100],
          ],
          colors: {
            donut: "#509EE3",
            cronut: "#DDECFA",
          },
          settings: {
            metric: {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
            },
          },
        }}
      />,
    );

    screen.getByText("$5,100.00");
    screen.getAllByText("TOTAL");
  });
});
