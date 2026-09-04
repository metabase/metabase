import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { CollectionItemModel } from "metabase-types/api";

import { CollectionTypeFilter } from "./CollectionTypeFilter";

type SetupOpts = {
  availableModels?: string[];
  selectedFilters?: CollectionItemModel[] | null;
};

function setup({
  availableModels = ["dashboard", "card"],
  selectedFilters = null,
}: SetupOpts = {}) {
  const onSelectedFiltersChange = jest.fn();
  const view = renderWithProviders(
    <CollectionTypeFilter
      availableModels={availableModels}
      selectedFilters={selectedFilters}
      onSelectedFiltersChange={onSelectedFiltersChange}
    />,
  );

  return { ...view, onSelectedFiltersChange };
}

describe("CollectionTypeFilter", () => {
  it("renders nothing when no supported models are available", () => {
    setup({ availableModels: ["timeline", "snippet"] });

    expect(
      screen.queryByTestId("collection-type-filter-button"),
    ).not.toBeInTheDocument();
  });

  it("shows only available options in display order, checked by default", async () => {
    setup({
      availableModels: [
        "metric",
        "card",
        "collection",
        "dataset",
        "dashboard",
        "exploration",
      ],
    });

    const filterButton = screen.getByTestId("collection-type-filter-button");
    expect(filterButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(filterButton);

    expect(filterButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Filter by type")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    const labels = [
      "Collection",
      "Dashboard",
      "Model",
      "Question",
      "Metric",
      "Research",
    ];
    expect(checkboxes).toHaveLength(6);
    expect(checkboxes).toEqual(
      labels.map((label) => screen.getByLabelText(label)),
    );
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeChecked();
    }
  });

  it("returns the remaining models when an option is unchecked", async () => {
    const { onSelectedFiltersChange } = setup();

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(["card"]);
  });

  it("clears the filter when all available options are checked", async () => {
    const { onSelectedFiltersChange } = setup({
      selectedFilters: ["dashboard"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Question"));

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(null);
  });

  it("announces the active state only while filtering", () => {
    const { unmount } = setup();

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();

    unmount();
    setup({ selectedFilters: ["dashboard"] });

    expect(
      screen.getByRole("button", { name: "Filter, filters applied" }),
    ).toBeInTheDocument();
  });
});
