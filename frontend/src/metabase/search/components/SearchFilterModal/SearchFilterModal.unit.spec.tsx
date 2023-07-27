import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { waitFor, within, renderWithProviders, screen } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { createMockSearchResult } from "metabase-types/api/mocks";
import { SearchFilterModal } from "metabase/search/components/SearchFilterModal/SearchFilterModal";
import { SearchModelType } from "metabase-types/api";
import { SearchFilters } from "metabase/search/util/filter-types";

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
  "dashboard",
  "collection",
  "database",
  "dataset",
  "table",
  "card",
  "pulse",
  "metric",
];

const TEST_INITIAL_FILTERS: SearchFilters = {
  type: TEST_TYPES,
};

const setup = async ({
  initialFilters = {},
  availableModelTypes = TEST_TYPES,
} = {}) => {
  const onChangeFilters = jest.fn();

  setupSearchEndpoints(
    availableModelTypes.map((type, index) =>
      createMockSearchResult({ model: type, id: index + 1 }),
    ),
  );

  renderWithProviders(
    <TestSearchFilterModal
      initialFilters={initialFilters}
      onChangeFilters={onChangeFilters}
    />,
  );
  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return {
    onChangeFilters,
  };
};

describe("SearchFilterModal", () => {
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
