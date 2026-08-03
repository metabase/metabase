import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  type CollectionItemTypeFilterValue,
  REGULAR_COLLECTION_FILTER,
} from "metabase/common/collections/types";
import type { CollectionAuthorityLevelFilter } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { CollectionTypeFilter } from "./CollectionTypeFilter";

type SetupOpts = {
  availableModels?: string[];
  availableAuthorityLevels?: CollectionAuthorityLevelFilter[];
  selectedFilters?: CollectionItemTypeFilterValue[] | null;
};

function setup({
  availableModels = ["dashboard", "card"],
  availableAuthorityLevels,
  selectedFilters = null,
}: SetupOpts = {}) {
  const onSelectedFiltersChange = jest.fn();
  const view = renderWithProviders(
    <CollectionTypeFilter
      availableModels={availableModels}
      availableAuthorityLevels={availableAuthorityLevels}
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
        "timeline",
        "card",
        "collection",
        "dataset",
        "dashboard",
      ],
    });

    const filterButton = screen.getByTestId("collection-type-filter-button");
    expect(filterButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(filterButton);

    expect(filterButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Filter by type")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    const labels = ["Collection", "Dashboard", "Model", "Question", "Metric"];
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes).toEqual(
      labels.map((label) => screen.getByLabelText(label)),
    );
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeChecked();
    }
    expect(screen.queryByLabelText("Timeline")).not.toBeInTheDocument();
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

  it("shows the indicator only while filtering", () => {
    const { unmount } = setup();

    expect(screen.getByTestId("type-filter-indicator")).toHaveAttribute(
      "data-filtering",
      "false",
    );

    unmount();
    setup({ selectedFilters: ["dashboard"] });

    expect(screen.getByTestId("type-filter-indicator")).toHaveAttribute(
      "data-filtering",
      "true",
    );
  });

  it("keeps official collections inside the generic Collection option without the plugin", async () => {
    setup({
      availableModels: ["collection"],
      availableAuthorityLevels: ["regular", "official"],
    });

    await userEvent.click(screen.getByTestId("collection-type-filter-button"));

    expect(screen.getByLabelText("Collection")).toBeChecked();
    expect(
      screen.queryByLabelText("Official collections"),
    ).not.toBeInTheDocument();
  });

  describe("with the official collections plugin", () => {
    beforeEach(() => {
      mockSettings({
        "token-features": createMockTokenFeatures({
          official_collections: true,
        }),
      });
      setupEnterpriseOnlyPlugin("collections");
    });

    it("shows separate regular and official options when both are available", async () => {
      setup({
        availableModels: ["collection", "dashboard"],
        availableAuthorityLevels: ["regular", "official"],
      });

      await userEvent.click(
        screen.getByTestId("collection-type-filter-button"),
      );

      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toEqual([
        screen.getByLabelText("Collection"),
        screen.getByLabelText("Official collections"),
        screen.getByLabelText("Dashboard"),
      ]);
      for (const checkbox of checkboxes) {
        expect(checkbox).toBeChecked();
      }
    });

    it("shows only Official collections when no regular collection is available", async () => {
      setup({
        availableModels: ["collection"],
        availableAuthorityLevels: ["official"],
      });

      await userEvent.click(
        screen.getByTestId("collection-type-filter-button"),
      );

      expect(screen.queryByLabelText("Collection")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Official collections")).toBeChecked();
    });

    it("returns the regular alias when Official collections is unchecked", async () => {
      const { onSelectedFiltersChange } = setup({
        availableModels: ["collection"],
        availableAuthorityLevels: ["regular", "official"],
      });

      await userEvent.click(
        screen.getByTestId("collection-type-filter-button"),
      );
      await userEvent.click(screen.getByLabelText("Official collections"));

      expect(onSelectedFiltersChange).toHaveBeenCalledWith([
        REGULAR_COLLECTION_FILTER,
      ]);
    });
  });
});
