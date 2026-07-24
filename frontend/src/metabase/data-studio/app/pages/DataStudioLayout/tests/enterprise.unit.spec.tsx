import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";
import * as Urls from "metabase/urls";

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

  describe("Remote sync button", () => {
    it("should show Remote sync button when git settings is visible", async () => {
      setup({ remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Remote sync")).toBeInTheDocument();
    });

    it("should hide Remote sync button when git settings is not visible", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, remoteSyncEnabled: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByLabelText("Remote sync")).not.toBeInTheDocument();
    });

    it("should open modal when Remote sync button is clicked", async () => {
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

      expect(screen.getByText("Semantic layer")).toBeInTheDocument();
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

  describe("transform dirty indicator", () => {
    it("should show dirty indicator on Transforms tab when transforms have dirty changes", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        remoteSyncBranch: "main",
        isNavbarOpened: true,
        hasTransformDirtyChanges: true,
        remoteSyncTransforms: true,
      });

      const transformsTab = await screen.findByLabelText("Data transformation");
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

      const transformsTab = screen.getByLabelText("Data transformation");
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

      const transformsTab = screen.getByLabelText("Data transformation");
      expect(
        within(transformsTab).queryByTestId("remote-sync-status"),
      ).not.toBeInTheDocument();
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

  describe("workspaces tab", () => {
    it("admin sees the tab and it links to the workspaces index", async () => {
      setup({ ...DEFAULT_EE_SETTINGS, isAdmin: true });

      const tab = await screen.findByLabelText("Workspaces");
      expect(tab).toHaveAttribute("href", Urls.workspaces());
    });

    it("non-admin does not see the tab", async () => {
      setup({
        ...DEFAULT_EE_SETTINGS,
        isAdmin: false,
      });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.queryByLabelText("Workspaces")).not.toBeInTheDocument();
    });
  });
});
