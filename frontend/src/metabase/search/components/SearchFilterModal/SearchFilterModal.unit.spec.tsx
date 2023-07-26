import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { waitFor, within, renderWithProviders, screen } from "__support__/ui";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { createMockSearchResult } from "metabase-types/api/mocks";
import { SearchModelType } from "metabase-types/api";
import { SearchFilterType } from "metabase/search/components/SearchFilterModal/types";
import { SearchFilterModal } from "metabase/search/components/SearchFilterModal/SearchFilterModal";

const TestSearchFilterModal = ({
  initialFilters = {},
  onChangeFilters = jest.fn(),
}: {
  initialFilters?: SearchFilterType;
  onChangeFilters?: (filters: SearchFilterType) => void;
}) => {
  const [filters, setFilters] = useState<SearchFilterType>(initialFilters);

  const onChange = (newFilters: SearchFilterType) => {
    setFilters(newFilters);
    onChangeFilters(newFilters);
  };

  return (
    <SearchFilterModal
      isOpen={true}
      setIsOpen={jest.fn()}
      value={filters}
      onChangeFilters={onChange}
    />
  );
};

const TEST_TYPES: SearchModelType[] = [
  "dashboard",
  "collection",
  "database",
  "dataset",
  "table",
  "card",
  "pulse",
  "metric",
];

const TEST_INITIAL_FILTERS: SearchFilterType = {
  type: TEST_TYPES,
};

const setup = async ({
  initialFilters = {},
  availableModelTypes = TEST_TYPES,
}: {
  initialFilters?: SearchFilterType;
  availableModelTypes?: SearchModelType[];
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
  // TODO: Write keyboard navigation tests.

  describe("Filter display", () => {
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
  });

  describe("Apply All Filters", () => {
    it("Should return all selected filters when `Apply all filters` is clicked", async () => {
      const { onChangeFilters } = await setup({
        initialFilters: TEST_INITIAL_FILTERS,
      });

      userEvent.click(screen.getByText("Apply all filters"));
      expect(onChangeFilters).toHaveBeenCalledWith(TEST_INITIAL_FILTERS);
    });
  });

  describe("Clear All Filters", () => {
    it("Should clear all selections when `Clear all filters` is clicked", async () => {
      const { onChangeFilters } = await setup();

      userEvent.click(screen.getByText("Clear all filters"));
      expect(onChangeFilters).toHaveBeenCalledWith({});
    });
  });
});
