import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor, within } from "__support__/ui";

import { setup } from "./DataStudioLayout.setup.spec";

describe("DataStudioLayout", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Set up git sync button", () => {
    it("should show Set up git sync button when git settings is visible", async () => {
      setup({ remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Set up git sync")).toBeInTheDocument();
    });

    it("should hide Set up git sync button when git settings is not visible", async () => {
      setup({ remoteSyncEnabled: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(
        screen.queryByLabelText("Set up git sync"),
      ).not.toBeInTheDocument();
    });

    it("should open modal when Set up git sync button is clicked", async () => {
      setup({ remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      const gitSettingsButton = screen.getByLabelText("Set up git sync");
      await userEvent.click(gitSettingsButton);

      await waitFor(() => {
        expect(
          screen.getByText("Set up remote sync for your Library"),
        ).toBeInTheDocument();
      });
    });

    it("should close modal when onClose is called", async () => {
      setup({ remoteSyncEnabled: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Open the modal
      const gitSettingsButton = screen.getByLabelText("Set up git sync");
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

    it("should show Set up git sync text when sidebar is expanded", async () => {
      setup({ remoteSyncEnabled: false, isNavbarOpened: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Set up git sync")).toBeInTheDocument();
    });
  });

  describe("sidebar rendering", () => {
    it("should render the sidebar with navigation tabs", async () => {
      setup({ remoteSyncBranch: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Exit")).toBeInTheDocument();
    });

    it("should render GitSyncAppBarControls when sidebar is expanded", async () => {
      setup({ remoteSyncBranch: "main", isNavbarOpened: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
    });

    it("should not render GitSyncAppBarControls when sidebar is collapsed", async () => {
      setup({ remoteSyncBranch: "main", isNavbarOpened: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("git-sync-controls")).not.toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup({ remoteSyncBranch: null });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  describe("transform dirty indicator", () => {
    it("should show dirty indicator on Transforms tab when transforms have dirty changes", async () => {
      setup({
        remoteSyncBranch: "main",
        isNavbarOpened: true,
        hasTransformDirtyChanges: true,
        remoteSyncTransforms: true,
      });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      // Should show the dirty indicator badge
      const transformsTab = screen.getByLabelText("Transforms");
      await waitFor(() => {
        expect(
          within(transformsTab).getByTestId("remote-sync-status"),
        ).toBeInTheDocument();
      });
    });

    it("should not show dirty indicator on Transforms tab when no dirty changes", async () => {
      setup({
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
