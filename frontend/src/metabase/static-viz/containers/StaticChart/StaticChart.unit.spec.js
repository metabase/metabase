import React from "react";
import { render, screen } from "@testing-library/react";
import StaticChart from "./StaticChart";

describe("StaticChart", () => {
  it("should render categorical/line", () => {
    render(
      <StaticChart
        type="categorical/line"
        options={{
          data: [
            ["Gadget", 20],
            ["Widget", 31],
          ],
          settings: {
            y: {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
            },
          },
          labels: {
            left: "Count",
            bottom: "Category",
          },
        }}
      />,
    );

    screen.getByText("Gadget");
    screen.getByText("Widget");
    screen.getAllByText("Count");
    screen.getAllByText("Category");
  });

  it("should render categorical/area", () => {
    render(
      <StaticChart
        type="categorical/area"
        options={{
          data: [
            ["Gadget", 20],
            ["Widget", 31],
          ],
          settings: {
            y: {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
            },
          },
          labels: {
            left: "Count",
            bottom: "Category",
          },
        }}
      />,
    );

    screen.getByText("Gadget");
    screen.getByText("Widget");
    screen.getAllByText("Count");
    screen.getAllByText("Category");
  });

  it("should render categorical/bar", () => {
    render(
      <StaticChart
        type="categorical/bar"
        options={{
          data: [
            ["Gadget", 20],
            ["Widget", 31],
          ],
          settings: {
            y: {
              number_style: "currency",
              currency: "USD",
              currency_style: "symbol",
            },
          },
          labels: {
            left: "Count",
            bottom: "Category",
          },
        }}
      />,
    );

    screen.getByText("Gadget");
    screen.getByText("Widget");
    screen.getAllByText("Count");
    screen.getAllByText("Category");
  });

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

  it("should render timeseries/line", () => {
    render(
      <StaticChart
        type="timeseries/line"
        options={{
          data: [
            ["2010-11-07", 20],
            ["2020-11-08", 30],
          ],
          settings: {
            x: {
              date_style: "dddd",
            },
          },
          labels: {
            left: "Count",
            bottom: "Time",
          },
        }}
      />,
    );

    screen.getAllByText("Count");
    screen.getAllByText("Time");
  });

  it("should render timeseries/area", () => {
    render(
      <StaticChart
        type="timeseries/area"
        options={{
          data: [
            ["2010-11-07", 20],
            ["2020-11-08", 30],
          ],
          settings: {
            x: {
              date_style: "MMM",
            },
          },
          labels: {
            left: "Count",
            bottom: "Time",
          },
        }}
      />,
    );

    screen.getAllByText("Count");
    screen.getAllByText("Time");
  });

  it("should render timeseries/bar", () => {
    render(
      <StaticChart
        type="timeseries/bar"
        options={{
          data: [
            ["2010-11-07", 20],
            ["2020-11-08", 30],
          ],
          settings: {
            x: {
              date_style: "dddd",
            },
          },
          labels: {
            left: "Count",
            bottom: "Time",
          },
        }}
      />,
    );

    screen.getAllByText("Count");
    screen.getAllByText("Time");
  });
});
