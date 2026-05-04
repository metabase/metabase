import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";

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

  describe("Set up remote sync button", () => {
    it("should show Set up remote sync button when git settings is visible", async () => {
      setup({ remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Set up remote sync")).toBeInTheDocument();
    });

    it("should hide Set up remote sync button when git settings is not visible", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncEnabled: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(
        screen.queryByLabelText("Set up remote sync"),
      ).not.toBeInTheDocument();
    });

    it("should open modal when Set up remote sync button is clicked", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      const gitSettingsButton = screen.getByLabelText("Set up remote sync");
      await userEvent.click(gitSettingsButton);

      await waitFor(() => {
        expect(
          screen.getByText("Set up remote sync for your Library"),
        ).toBeInTheDocument();
      });
    });

    it("should close modal when onClose is called", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Open the modal
      const gitSettingsButton = screen.getByLabelText("Set up remote sync");
      await userEvent.click(gitSettingsButton);

      await waitFor(() => {
        expect(
          screen.getByText("Set up remote sync for your Library"),
        ).toBeInTheDocument();
      });

      // Close the modal by pressing escape
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByText("Set up remote sync for your Library"),
        ).not.toBeInTheDocument();
      });
    });

    it("should show Set up remote sync text when sidebar is expanded", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncEnabled: false,
        isNavbarOpened: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Set up remote sync")).toBeInTheDocument();
    });
  });

  describe("sidebar rendering", () => {
    it("should render the sidebar with navigation tabs", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncBranch: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Library")).toBeInTheDocument();
    });

    it("should render GitSyncAppBarControls when sidebar is expanded", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
    });

    it("should not render GitSyncAppBarControls when sidebar is collapsed", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: false,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("git-sync-controls")).not.toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncBranch: null });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  describe("workspaces gating", () => {
    const ENTERPRISE_WORKSPACES_PLUGINS: Parameters<typeof setup>[0] = {
      ...DEFAULT_EE_SETTINGS,
      enterprisePlugins: [
        ...(DEFAULT_EE_SETTINGS.enterprisePlugins ?? []),
        "workspaces",
      ],
      tokenFeatures: {
        ...DEFAULT_EE_SETTINGS.tokenFeatures,
        workspaces: true,
      },
    };

    it("should not render a workspaces tab when the workspaces token feature is disabled", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        tokenFeatures: {
          ...DEFAULT_EE_SETTINGS.tokenFeatures,
          workspaces: false,
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Workspaces")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    });

    it("should not render a workspaces tab for non-admins even when the feature is enabled", async () => {
      setup({ ...ENTERPRISE_WORKSPACES_PLUGINS, isAdmin: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Workspaces")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    });

    it("should render the manager Workspaces tab when there is no active workspace on this instance", async () => {
      setup({ ...ENTERPRISE_WORKSPACES_PLUGINS, hasActiveWorkspace: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Workspaces")).toBeInTheDocument();
      expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
    });

    it("should render the instance Workspace tab when an active workspace is loaded", async () => {
      setup({ ...ENTERPRISE_WORKSPACES_PLUGINS, hasActiveWorkspace: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Workspace")).toBeInTheDocument();
      expect(screen.queryByLabelText("Workspaces")).not.toBeInTheDocument();
    });
  });

  describe("transform dirty indicator", () => {
    it("should show dirty indicator on Transforms tab when transforms have dirty changes", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: true,
        hasTransformDirtyChanges: true,
        remoteSyncTransforms: true,
      });

      const transformsTab = await screen.findByLabelText("Transforms");
      await waitFor(() => {
        expect(
          within(transformsTab).getByTestId("remote-sync-status"),
        ).toBeInTheDocument();
      });
    });

    it("should not show dirty indicator on Transforms tab when no dirty changes", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: true,
        hasTransformDirtyChanges: false,
        remoteSyncTransforms: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      const transformsTab = screen.getByLabelText("Transforms");
      expect(
        within(transformsTab).queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });

    it("should not show dirty indicator when remote-sync-transforms setting is disabled", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: true,
        hasTransformDirtyChanges: true,
        remoteSyncTransforms: false,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      const transformsTab = screen.getByLabelText("Transforms");
      expect(
        within(transformsTab).queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
    });
  });
});
