import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import { DEFAULT_EE_SETTINGS, setup } from "./setup";

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
      setup(DEFAULT_EE_SETTINGS);

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Semantic layer")).toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup(DEFAULT_EE_SETTINGS);

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  describe("transforms tab visibility", () => {
    const transformsReadySettings = {
      transformsSetupComplete: true,
      transformsEnabled: true,
    };

    it("should show Transforms tab for admins", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        ...transformsReadySettings,
        isAdmin: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
    });

    it("should show Transforms tab for a non-admin with transforms permission", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        ...transformsReadySettings,
        isAdmin: false,
        canAccessTransforms: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
    });

    it("should hide Transforms tab for a non-admin without transforms permission", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        ...transformsReadySettings,
        isAdmin: false,
        canAccessTransforms: false,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Transforms")).not.toBeInTheDocument();
    });
  });

  describe("data apps tab", () => {
    const enterprisePlugins = [
      ...(DEFAULT_EE_SETTINGS.enterprisePlugins ?? []),
      "data-apps" as const,
    ];

    afterEach(() => {
      reinitialize();
    });

    it("shows Data apps as an upsell without the data-apps feature", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, enterprisePlugins });

      const dataAppsTab = await screen.findByRole("link", {
        name: "Data apps",
      });
      expect(within(dataAppsTab).getByTestId("upsell-gem")).toBeInTheDocument();
      expect(within(dataAppsTab).queryByText("Beta")).not.toBeInTheDocument();
    });

    it("shows Data apps without an upsell with the data-apps feature", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        enterprisePlugins,
        tokenFeatures: {
          ...DEFAULT_EE_SETTINGS.tokenFeatures,
          "data-apps": true,
        },
      });

      const dataAppsTab = await screen.findByRole("link", {
        name: "Data apps",
      });
      expect(
        within(dataAppsTab).queryByTestId("upsell-gem"),
      ).not.toBeInTheDocument();
      expect(within(dataAppsTab).getByText("Beta")).toBeInTheDocument();
    });
  });
});
