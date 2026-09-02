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

  it("shows every type in display order, disabling those without items", async () => {
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
      "Document",
      "Research",
      "Table",
    ];
    expect(checkboxes).toHaveLength(8);
    expect(checkboxes).toEqual(
      labels.map((label) => screen.getByLabelText(label)),
    );
    for (const label of labels) {
      expect(screen.getByLabelText(label)).not.toBeChecked();
    }
    for (const label of ["Collection", "Dashboard", "Metric", "Research"]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    expect(screen.getByLabelText("Document")).toBeDisabled();
    expect(screen.getByLabelText("Table")).toBeDisabled();
  });

  it("keeps a checked type enabled after its last item is gone", async () => {
    const { onSelectedFiltersChange } = setup({
      availableModels: ["card"],
      selectedFilters: ["dashboard"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    const dashboard = screen.getByLabelText("Dashboard");
    expect(dashboard).toBeChecked();
    expect(dashboard).toBeEnabled();

    await userEvent.click(dashboard);

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(null);
  });

  it("applies a single type with one click", async () => {
    const { onSelectedFiltersChange } = setup();

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(["dashboard"]);
  });

  it("adds to the existing selection when another option is checked", async () => {
    const { onSelectedFiltersChange } = setup({
      selectedFilters: ["dashboard"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Question"));

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(["dashboard", "card"]);
  });

  it("removes a type from the selection when it is unchecked", async () => {
    const { onSelectedFiltersChange } = setup({
      selectedFilters: ["dashboard", "card"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Dashboard"));

    expect(onSelectedFiltersChange).toHaveBeenCalledWith(["card"]);
  });

  it("clears the filter when the last checked option is unchecked", async () => {
    const { onSelectedFiltersChange } = setup({
      selectedFilters: ["dashboard"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));
    await userEvent.click(screen.getByLabelText("Dashboard"));

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
