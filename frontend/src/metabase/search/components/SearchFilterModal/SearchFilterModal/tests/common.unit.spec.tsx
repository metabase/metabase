import userEvent from "@testing-library/user-event";
import {
  COMMON_INITIAL_FILTERS,
  setup,
} from "metabase/search/components/SearchFilterModal/SearchFilterModal/tests/setup";
import { screen, within } from "__support__/ui";

describe("SearchFilterModal", () => {
  describe("applying and clearing filters", () => {
    it("should return all selected filters when `Apply all filters` is clicked", async () => {
      const { onChangeFilters } = await setup({
        initialFilters: COMMON_INITIAL_FILTERS,
      });

      userEvent.click(screen.getByText("Apply all filters"));
      expect(onChangeFilters).toHaveBeenCalledWith(COMMON_INITIAL_FILTERS);
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

  describe("populating selected filters from initial values", () => {
    it("should populate type filters", async () => {
      await setup({
        initialFilters: COMMON_INITIAL_FILTERS,
      });

      const typeFilter = screen.getByTestId("type-search-filter");
      within(typeFilter)
        .getAllByRole("checkbox")
        .forEach(checkbox => {
          expect(checkbox).toBeChecked();
        });
    });
  });
});
