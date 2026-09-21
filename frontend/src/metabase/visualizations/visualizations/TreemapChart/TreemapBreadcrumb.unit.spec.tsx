import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";

describe("TreemapBreadcrumb", () => {
  it("shows 'Total' with the value at the overview", () => {
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel={null}
        value="$11,576,000"
        onBackClick={jest.fn()}
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$11,576,000")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a back button with the drilled-in group when drilled", async () => {
    const onBackClick = jest.fn();
    renderWithProviders(
      <TreemapBreadcrumb
        groupLabel="Legumes"
        value="$2,100,000"
        onBackClick={onBackClick}
      />,
    );

    expect(screen.getByRole("button", { name: "Legumes" })).toBeInTheDocument();
    expect(screen.getByText("$2,100,000")).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Legumes" }));
    expect(onBackClick).toHaveBeenCalledTimes(1);
  });
});
