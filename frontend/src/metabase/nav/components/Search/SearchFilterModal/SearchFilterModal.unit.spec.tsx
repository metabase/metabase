import { useState } from "react";
import { waitFor, within, renderWithProviders, screen } from "__support__/ui";
import { SearchFilterModal } from "metabase/nav/components/Search/SearchFilterModal/SearchFilterModal";
import { SearchFilterType } from "metabase/search/util";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { createMockCollectionItem } from "metabase-types/api/mocks";
import { SearchModelType } from "metabase-types/api";
import userEvent from "@testing-library/user-event";

const TestSearchFilterModal = () => {
  const [filters, setFilters] = useState<SearchFilterType>({});

  return (
    <SearchFilterModal
      isOpen={true}
      setIsOpen={jest.fn()}
      value={filters}
      onChangeFilters={setFilters}
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

const setup = async ({
  availableModelTypes = TEST_TYPES,
}: {
  availableModelTypes?: SearchModelType[];
} = {}) => {
  setupSearchEndpoints(
    availableModelTypes.map((type, index) =>
      createMockCollectionItem({ model: type, id: index + 1 }),
    ),
  );

  renderWithProviders(<TestSearchFilterModal />);
  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
};

describe("SearchFilterModal", () => {
  // describe("Keyboard navigation", () => {
  //   it("Allow keyboard navigation through all filters", async () => {
  //     await setup();
  //
  //     expect(
  //       within(
  //         screen.getByTestId("type-filter-checkbox-group"),
  //       ).getByDisplayValue(TEST_TYPES[0]),
  //     ).toHaveFocus();
  //
  //     screen.debug(undefined, 100000);
  //     // TODO
  //   });
  //
  //   it("Allow selection of filters with keyboard", async () => {
  //     await setup();
  //     screen.debug(undefined, 100000);
  //     // TODO
  //   });
  // });

  describe("Filter display", () => {
    it("should populate selected filters when `value` is passed in", () => {});
  });

  describe("Apply All Filters", () => {
    it("Should return all selected filters when `Apply all filters` is clicked", () => {
      // TODO
    });
  });

  describe("Clear All Filters", () => {
    it("Should clear all selections when `Clear all filters` is clicked", () => {
      // TODO
    });
  });
});
