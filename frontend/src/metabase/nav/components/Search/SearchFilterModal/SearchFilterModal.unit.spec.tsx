import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { waitFor, within, renderWithProviders, screen } from "__support__/ui";
import { SearchFilterModal } from "metabase/nav/components/Search/SearchFilterModal/SearchFilterModal";
import { SearchFilterType } from "metabase/search/util";
import { setupSearchEndpoints } from "__support__/server-mocks";
import {
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { SearchModelType } from "metabase-types/api";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";

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
  [FilterType.Type]: TEST_TYPES,
}

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
  describe("Keyboard navigation", () => {
    it("Allow keyboard navigation through all filters", async () => {
      await setup();

      expect(
        within(
          screen.getByTestId("type-filter-checkbox-group"),
        ).getByDisplayValue(TEST_TYPES[0]),
      ).toHaveFocus();

      screen.debug(undefined, 100000);
      // TODO
    });

    it("Allow selection of filters with keyboard", async () => {
      await setup();
      screen.debug(undefined, 100000);
      // TODO
    });
  });

  describe("Filter display",  () => {
    it("should populate selected filters when `value` is passed in", async () => {
      await setup({
        initialFilters: TEST_INITIAL_FILTERS,
      })
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
