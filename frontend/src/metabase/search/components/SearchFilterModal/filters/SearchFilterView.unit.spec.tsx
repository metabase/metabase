import { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchFilterView } from "./SearchFilterView";

type SetupProps = {
  title?: string;
  tooltip?: string;
  isLoading?: boolean;
  children?: ReactNode;
};

const setup = ({
  title = "Title",
  tooltip = undefined,
  isLoading = false,
  children = <div>Children</div>,
}: SetupProps = {}) => {
  render(
    <SearchFilterView title={title} tooltip={tooltip} isLoading={isLoading}>
      {children}
    </SearchFilterView>,
  );
};

describe("SearchFilterView", () => {
  it("renders title and children without tooltip when not loading", () => {
    setup();

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Children")).toBeInTheDocument();
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  it("renders title, children, and tooltip when not loading", () => {
    const title = "Test Title";
    const tooltip = "Test Tooltip";
    const children = <div>Test Content</div>;

    setup({ title, tooltip, children });

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
    const tooltipIcon = screen.getByLabelText("info_outline icon");
    expect(tooltipIcon).toBeInTheDocument();
    userEvent.hover(tooltipIcon);
    expect(screen.getByText("Test Tooltip")).toBeInTheDocument();
  });

  it("renders loading spinner when isLoading is true", () => {
    setup({ isLoading: true });

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.queryByText("Children")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("info_outline icon"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });
});
