import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

describe("DataStudioLayout", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sidebar rendering", () => {
    it("should render the sidebar with navigation tabs", async () => {
      setup({ remoteSyncBranch: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Data structure")).toBeInTheDocument();
      expect(screen.getByText("Exit")).toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup({ remoteSyncBranch: null });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  describe("transforms menu item upsell icon", () => {
    it("should not display upsell icon when plan is OSS", async () => {
      // OSS plan is determined by having no token features or basic features only
      setup({
        remoteSyncBranch: "main",
        tokenFeatures: {},
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Transforms menu item should be present
      expect(screen.getByText("Transforms")).toBeInTheDocument();

      // Upsell gem should not be displayed within the transforms link
      const transformsLink = screen.getByText("Transforms").closest("a");
      expect(transformsLink).toBeInTheDocument();

      const upsellGems = screen.queryAllByTestId("upsell-gem");
      // Filter to only upsell gems within transforms link
      const transformsUpsellGems = upsellGems.filter((gem) =>
        transformsLink?.contains(gem),
      );
      expect(transformsUpsellGems).toHaveLength(0);
    });

    it("should display upsell icon when plan is not OSS and transforms feature is not available", async () => {
      // Non-OSS plan with some features but transforms not enabled
      setup({
        remoteSyncBranch: "main",
        tokenFeatures: {
          hosting: true, // Makes it a starter plan
          transforms: false, // Transforms feature not available
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Transforms menu item should be present
      expect(screen.getByText("Transforms")).toBeInTheDocument();

      // Upsell gem should be displayed within the transforms link
      const transformsLink = screen.getByText("Transforms").closest("a");
      expect(transformsLink).toBeInTheDocument();

      const upsellGems = screen.queryAllByTestId("upsell-gem");
      // Filter to only upsell gems within transforms link
      const transformsUpsellGems = upsellGems.filter((gem) =>
        transformsLink?.contains(gem),
      );
      expect(transformsUpsellGems.length).toBeGreaterThan(0);
    });

    it("should not display upsell icon when plan is not OSS and transforms feature is available", async () => {
      // Non-OSS plan with transforms feature enabled
      setup({
        remoteSyncBranch: "main",
        tokenFeatures: {
          hosting: true, // Makes it a starter plan
          transforms: true, // Transforms feature available
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Transforms menu item should be present
      expect(screen.getByText("Transforms")).toBeInTheDocument();

      // Upsell gem should not be displayed within the transforms link
      const transformsLink = screen.getByText("Transforms").closest("a");
      expect(transformsLink).toBeInTheDocument();

      const upsellGems = screen.queryAllByTestId("upsell-gem");
      // Filter to only upsell gems within transforms link
      const transformsUpsellGems = upsellGems.filter((gem) =>
        transformsLink?.contains(gem),
      );
      expect(transformsUpsellGems).toHaveLength(0);
    });
  });
});
