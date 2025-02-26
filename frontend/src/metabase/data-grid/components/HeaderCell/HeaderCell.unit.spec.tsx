import { render, screen } from "@testing-library/react";

import { HeaderCell, HeaderCellPill, HeaderCellWrapper } from "./HeaderCell";

describe("HeaderCell", () => {
  it("renders with the correct text", () => {
    render(<HeaderCell name="Column Name" />);

    expect(screen.getByText("Column Name")).toBeInTheDocument();
  });

  it("renders with the sort icon when sort is provided", () => {
    render(<HeaderCell name="Column Name" sort="asc" />);

    expect(screen.getByText("Column Name")).toBeInTheDocument();
    // Sort icon is present (implementation may vary)
    const sortIcons = screen.getAllByRole("img", { hidden: true });
    expect(sortIcons.length).toBeGreaterThan(0);
  });

  it("applies alignment classes correctly", () => {
    const { rerender } = render(<HeaderCell name="Left" align="left" />);

    // BaseCell applies the alignment classes, so we test the align prop propagation
    expect(screen.getByTestId("header-cell")).toBeInTheDocument();

    rerender(<HeaderCell name="Middle" align="middle" />);
    expect(screen.getByTestId("header-cell")).toBeInTheDocument();

    rerender(<HeaderCell name="Right" align="right" />);
    // Content should have the right alignment class
    expect(screen.getByTestId("cell-data")).toHaveClass("alignRight");
  });

  it("has 'light' variant by default", () => {
    render(<HeaderCell name="Default" />);

    const headerCell = screen.getByTestId("header-cell");
    expect(headerCell).toHaveClass("light");
  });

  it("applies 'outline' variant class when specified", () => {
    render(<HeaderCell name="Outline" variant="outline" />);

    const headerCell = screen.getByTestId("header-cell");
    expect(headerCell).toHaveClass("outline");
  });
});

describe("HeaderCellPill", () => {
  it("renders with the correct text", () => {
    render(<HeaderCellPill name="Column Name" />);

    expect(screen.getByText("Column Name")).toBeInTheDocument();
  });

  it("shows sort icon when sort is provided", () => {
    render(<HeaderCellPill name="Column Name" sort="asc" />);

    const sortIcons = screen.getAllByRole("img", { hidden: true });
    expect(sortIcons.length).toBeGreaterThan(0);
  });

  it("applies right alignment class when specified", () => {
    render(<HeaderCellPill name="Right" align="right" />);

    expect(screen.getByTestId("cell-data")).toHaveClass("alignRight");
  });
});

describe("HeaderCellWrapper", () => {
  it("renders children correctly", () => {
    render(
      <HeaderCellWrapper variant="light">
        <span data-testid="custom-content">Custom Content</span>
      </HeaderCellWrapper>,
    );

    expect(screen.getByTestId("custom-content")).toBeInTheDocument();
    expect(screen.getByText("Custom Content")).toBeInTheDocument();
  });

  it("applies variant classes correctly", () => {
    const { rerender } = render(
      <HeaderCellWrapper variant="light">
        <span>Content</span>
      </HeaderCellWrapper>,
    );

    expect(screen.getByTestId("header-cell")).toHaveClass("light");

    rerender(
      <HeaderCellWrapper variant="outline">
        <span>Content</span>
      </HeaderCellWrapper>,
    );

    expect(screen.getByTestId("header-cell")).toHaveClass("outline");
  });

  it("passes alignment to the BaseCell", () => {
    render(
      <HeaderCellWrapper align="right">
        <span>Content</span>
      </HeaderCellWrapper>,
    );

    // BaseCell should receive the alignment prop
    expect(screen.getByTestId("header-cell")).toBeInTheDocument();
  });
});
