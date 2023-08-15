import {
  PREMIUM_INITIAL_FILTERS,
  setup,
  SetupOpts,
} from "metabase/search/components/SearchFilterModal/SearchFilterModal/tests/setup";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { screen } from "__support__/ui";

const setupPremium = async (opts?: SetupOpts) => {
  return await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ content_verification: true }),
    hasEnterprisePlugins: true,
  });
};

describe("SearchFilterModal", () => {
  describe("rendering filters", () => {
    it("renders `Verified` filter", async () => {
      await setupPremium();

      expect(screen.getByText("Verified")).toBeInTheDocument();
      expect(screen.getByText("Only verified items")).toBeInTheDocument();
      expect(screen.getByText("All items")).toBeInTheDocument();
    });
  });

  describe("populating selected filters from initial values", () => {
    it("should populate verified filter when `verified` key is true", async () => {
      await setupPremium({
        initialFilters: PREMIUM_INITIAL_FILTERS,
      });

      const verifiedButton = screen.getByRole("button", {
        name: "Only verified items",
      });
      expect(verifiedButton).toHaveAttribute("data-is-selected", "true");
    });

    it("should not populate verified filter if verified key has no value", async () => {
      await setupPremium();

      const allItemsButton = screen.getByRole("button", {
        name: "All items",
      });

      expect(allItemsButton).not.toHaveAttribute("data-is-selected");
    });
  });
});
