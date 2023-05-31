import { render, screen } from "@testing-library/react";
import ChartSkeleton from "./ChartSkeleton";

describe("ChartSkeleton", () => {
  it("should render area", () => {
    render(<ChartSkeleton display="area" name="Area" />);
    expect(screen.getByText("Area")).toBeInTheDocument();
  });

  it("should render bar", () => {
    render(<ChartSkeleton display="bar" name="Bar" />);
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });

  it("should render funnel", () => {
    render(<ChartSkeleton display="funnel" name="Funnel" />);
    expect(screen.getByText("Funnel")).toBeInTheDocument();
  });

  it("should render gauge", () => {
    render(<ChartSkeleton display="gauge" name="Gauge" />);
    expect(screen.getByText("Gauge")).toBeInTheDocument();
  });

  it("should render line", () => {
    render(<ChartSkeleton display="line" name="Line" />);
    expect(screen.getByText("Line")).toBeInTheDocument();
  });

  it("should render map", () => {
    render(<ChartSkeleton display="map" name="Map" />);
    expect(screen.getByText("Map")).toBeInTheDocument();
  });

  it("should render table", () => {
    render(<ChartSkeleton display="table" name="Table" />);
    expect(screen.getByText("Table")).toBeInTheDocument();
  });

  it("should render pie", () => {
    render(<ChartSkeleton display="pie" name="Pie" />);
    expect(screen.getByText("Pie")).toBeInTheDocument();
  });

  it("should render progress", () => {
    render(<ChartSkeleton display="progress" name="Progress" />);
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  it("should render row", () => {
    render(<ChartSkeleton display="row" name="Row" />);
    expect(screen.getByText("Row")).toBeInTheDocument();
  });

  it("should render scalar", () => {
    render(<ChartSkeleton display="scalar" name="Scalar" />);
    expect(screen.getByText("Scalar")).toBeInTheDocument();
  });

  it("should render scatter", () => {
    render(<ChartSkeleton display="scatter" name="Scatter" />);
    expect(screen.getByText("Scatter")).toBeInTheDocument();
  });

  it("should render smartscalar", () => {
    render(<ChartSkeleton display="smartscalar" name="Trend" />);
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });

  it("should render waterfall", () => {
    render(<ChartSkeleton display="waterfall" name="Waterfall" />);
    expect(screen.getByText("Waterfall")).toBeInTheDocument();
  });
});
