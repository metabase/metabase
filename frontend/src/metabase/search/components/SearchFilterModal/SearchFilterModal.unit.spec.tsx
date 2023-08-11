import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { waitFor, within, renderWithProviders, screen } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import {
  createMockSearchResult,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { SearchFilterModal } from "metabase/search/components/SearchFilterModal/SearchFilterModal";
import { SearchModelType } from "metabase-types/api";
import { SearchFilters } from "metabase/search/types";
import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockState } from "metabase-types/store/mocks";
import { mockSettings } from "__support__/settings";

const TestSearchFilterModal = ({
  initialFilters = {},
  onChangeFilters,
}: {
  initialFilters?: SearchFilters;
  onChangeFilters: jest.Mock;
}) => {
  const [filters, setFilters] = useState(initialFilters);

  onChangeFilters.mockImplementation(newFilters => setFilters(newFilters));

  return (
    <SearchFilterModal
      isOpen={true}
      setIsOpen={jest.fn()}
      value={filters}
      onChangeFilters={onChangeFilters}
    />
  );
};

const TEST_TYPES: Array<SearchModelType> = [
  "card",
  "collection",
  "dashboard",
  "database",
  "dataset",
  "metric",
  "pulse",
  "segment",
  "table",
];

const TEST_INITIAL_FILTERS: SearchFilters = {
  type: TEST_TYPES,
  verified: true,
};

const setup = async ({
  initialFilters = {},
  availableModelTypes = TEST_TYPES,
  hasEnterprisePlugins = true,
} = {}) => {
  const onChangeFilters = jest.fn();

  setupSearchEndpoints(
    availableModelTypes.map((type, index) =>
      createMockSearchResult({ model: type, id: index + 1 }),
    ),
  );

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: hasEnterprisePlugins,
      }),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <TestSearchFilterModal
      initialFilters={initialFilters}
      onChangeFilters={onChangeFilters}
    />,
    { storeInitialState: state },
  );
  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return {
    onChangeFilters,
  };
};

describe("SearchFilterModal", () => {
  it("should not render `Only verified items` filter when `content_verification` is disabled", async () => {
    await setup({
      hasEnterprisePlugins: false,
    });

    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Only verified items")).not.toBeInTheDocument();
    expect(screen.queryByText("All items")).not.toBeInTheDocument();
  });

  it("should populate selected filters when `value` is passed in", async () => {
    await setup({
      initialFilters: TEST_INITIAL_FILTERS,
    });

    const typeFilter = screen.getByTestId("type-search-filter");
    within(typeFilter)
      .getAllByRole("checkbox")
      .forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });

    const verifiedButton = screen.getByRole("button", {
      name: "Only verified items",
    });
    expect(verifiedButton).toHaveAttribute("data-is-selected", "true");
  });

  it("should not populate filter object with key if key has no value", async () => {
    const { onChangeFilters } = await setup({
      initialFilters: TEST_INITIAL_FILTERS,
    });
    const typeFilter = screen.getByTestId("type-search-filter");
    within(typeFilter)
      .getAllByRole("checkbox")
      .forEach(checkbox => {
        userEvent.click(checkbox);
      });

    const verifiedButton = screen.getByRole("button", {
      name: "All items",
    });
    userEvent.click(verifiedButton);

    userEvent.click(screen.getByText("Apply all filters"));

    expect(onChangeFilters).toHaveBeenCalledWith({});
  });

  it("should return all selected filters when `Apply all filters` is clicked", async () => {
    const { onChangeFilters } = await setup({
      initialFilters: TEST_INITIAL_FILTERS,
    });

    userEvent.click(screen.getByText("Apply all filters"));
    expect(onChangeFilters).toHaveBeenCalledWith(TEST_INITIAL_FILTERS);
  });

  it("should clear all selections when `Clear all filters` is clicked", async () => {
    const { onChangeFilters } = await setup();

    userEvent.click(screen.getByText("Clear all filters"));
    expect(onChangeFilters).toHaveBeenCalledWith({});
  });

  it("should not change filters when `Cancel` is clicked", async () => {
    const { onChangeFilters } = await setup();

    userEvent.click(screen.getByText("Cancel"));
    expect(onChangeFilters).not.toHaveBeenCalled();
  });
});
