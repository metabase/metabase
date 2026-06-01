import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";

describe("TreemapBreadcrumb", () => {
  it("renders the 'All' root and the drilled-in group label", () => {
    renderWithProviders(
      <TreemapBreadcrumb groupLabel="Phones" onAllClick={jest.fn()} />,
    );

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Phones")).toBeInTheDocument();
  });

  it("calls onAllClick when 'All' is clicked", async () => {
    const onAllClick = jest.fn();
    renderWithProviders(
      <TreemapBreadcrumb groupLabel="Phones" onAllClick={onAllClick} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "All" }));

    expect(onAllClick).toHaveBeenCalledTimes(1);
  });

  it("does not make the current group clickable", () => {
    renderWithProviders(
      <TreemapBreadcrumb groupLabel="Phones" onAllClick={jest.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: "Phones" }),
    ).not.toBeInTheDocument();
  });
});
