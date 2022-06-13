import React from "react";
import { render, screen } from "@testing-library/react";
import ChartSkeleton from "./ChartSkeleton";

describe("ChartSkeleton", () => {
  it("should render area", () => {
    render(<ChartSkeleton display="area" displayName="Area" />);
    expect(screen.getByText("Area")).toBeInTheDocument();
  });

  it("should render bar", () => {
    render(<ChartSkeleton display="bar" displayName="Bar" />);
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });

  it("should render funnel", () => {
    render(<ChartSkeleton display="funnel" displayName="Funnel" />);
    expect(screen.getByText("Funnel")).toBeInTheDocument();
  });

  it("should render gauge", () => {
    render(<ChartSkeleton display="gauge" displayName="Gauge" />);
    expect(screen.getByText("Gauge")).toBeInTheDocument();
  });

  it("should render line", () => {
    render(<ChartSkeleton display="line" displayName="Line" />);
    expect(screen.getByText("Line")).toBeInTheDocument();
  });

  it("should render map", () => {
    render(<ChartSkeleton display="map" displayName="Map" />);
    expect(screen.getByText("Map")).toBeInTheDocument();
  });

  it("should render table", () => {
    render(<ChartSkeleton display="table" displayName="Table" />);
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("should render pie", () => {
    render(<ChartSkeleton display="pie" displayName="Pie" />);
    expect(screen.getByText("Pie")).toBeInTheDocument();
  });

  it("should render progress", () => {
    render(<ChartSkeleton display="progress" displayName="Progress" />);
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  it("should render row", () => {
    render(<ChartSkeleton display="row" displayName="Row" />);
    expect(screen.getByText("Row")).toBeInTheDocument();
  });

  it("should render scalar", () => {
    render(<ChartSkeleton display="scalar" displayName="Scalar" />);
    expect(screen.getByText("Scalar")).toBeInTheDocument();
  });

  it("should render scatter", () => {
    render(<ChartSkeleton display="scatter" displayName="Scatter" />);
    expect(screen.getByText("Scatter")).toBeInTheDocument();
  });

  it("should render smartscalar", () => {
    render(<ChartSkeleton display="smartscalar" displayName="Trend" />);
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });

  it("should render waterfall", () => {
    render(<ChartSkeleton display="waterfall" displayName="Waterfall" />);
    expect(screen.getByText("Waterfall")).toBeInTheDocument();
  });
});
