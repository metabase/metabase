import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockRemoteSyncDirtyItem } from "metabase-types/api/mocks";

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

  describe("remote sync", () => {
    afterEach(() => {
      reinitialize();
    });

    it("offers remote sync setup in modal", async () => {
      setup(DEFAULT_EE_SETTINGS);

      await userEvent.click(
        await screen.findByRole("button", { name: "Set up remote sync" }),
      );

      expect(
        await screen.findByText("Set up remote sync for your Library"),
      ).toBeInTheDocument();
    });

    it("shows remote sync controls once set up", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncBranch: "main" });

      expect(
        await screen.findByTestId("git-sync-controls"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Set up remote sync" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      {
        entity: createMockRemoteSyncDirtyItem({ model: "nativequerysnippet" }),
        tab: "SQL snippets",
      },
      {
        entity: createMockRemoteSyncDirtyItem({ model: "action" }),
        tab: "Data actions",
      },
      {
        entity: createMockRemoteSyncDirtyItem({ model: "glossary" }),
        tab: "Glossary",
      },
    ])("marks only $tab tab for its changes", async ({ entity, tab }) => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        dirty: [entity],
      });

      const tabElement = await screen.findByRole("link", { name: tab });
      await waitFor(() =>
        expect(
          within(tabElement).getByTestId("remote-sync-status"),
        ).toBeInTheDocument(),
      );
      expect(screen.getAllByTestId("remote-sync-status")).toHaveLength(1);
    });
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
