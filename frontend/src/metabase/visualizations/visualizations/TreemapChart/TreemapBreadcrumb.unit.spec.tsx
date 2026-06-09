import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";

describe("TreemapBreadcrumb", () => {
  it("shows 'Total' with the value and percentage at the overview", () => {
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel={null}
        value="$11,576,000"
        percent="100%"
        onBackClick={jest.fn()}
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$11,576,000")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("does not render a back button at the overview", () => {
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel={null}
        value="$11,576,000"
        percent="100%"
        onBackClick={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a back button with the drilled-in group when drilled", () => {
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel="Phones"
        value="$2,100,000"
        percent="100%"
        onBackClick={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Phones" })).toBeInTheDocument();
    expect(screen.getByText("$2,100,000")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("calls onBackClick when the back button is clicked", async () => {
    const onBackClick = jest.fn();
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel="Phones"
        value="$2,100,000"
        percent="100%"
        onBackClick={onBackClick}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Phones" }));

    expect(onBackClick).toHaveBeenCalledTimes(1);
  });
});
