import userEvent from "@testing-library/user-event";
import {
  PREMIUM_INITIAL_FILTERS,
  setup,
  SetupOpts,
} from "metabase/search/components/SearchFilterModal/SearchFilterModal/tests/setup";
import { screen } from "__support__/ui";

const setupEnterprise = async (opts?: SetupOpts) => {
  return await setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("SearchFilterModal", () => {
  describe("rendering filters", () => {
    it("should not render `Verified` filter", async () => {
      await setupEnterprise({
        hasEnterprisePlugins: false,
      });

      expect(screen.queryByText("Verified")).not.toBeInTheDocument();
      expect(screen.queryByText("Only verified items")).not.toBeInTheDocument();
      expect(screen.queryByText("All items")).not.toBeInTheDocument();
    });
  });

  describe("populating selected filters from initial values", () => {
    it("should not populate verified filter when `verified` key is true", async () => {
      const { onChangeFilters } = await setupEnterprise({
        initialFilters: PREMIUM_INITIAL_FILTERS,
      });

      userEvent.click(screen.getByText("Apply all filters"));
      expect(onChangeFilters).toHaveBeenCalledWith({
        ...PREMIUM_INITIAL_FILTERS,
        verified: undefined,
      });
    });
  });
});
