import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { initializePlugin as initializeDependenciesPlugin } from "metabase-enterprise/dependencies";
import { initializePlugin as initializeFeatureLevelPermissionsPlugin } from "metabase-enterprise/feature_level_permissions";
import { initializePlugin as initializeRemoteSyncPlugin } from "metabase-enterprise/remote_sync";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { initializePlugin as initializeTransformsPlugin } from "metabase-enterprise/transforms";
import {
  createMockCollection,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DataStudioLayout } from "./DataStudioLayout";

// Mock hasPremiumFeature to enable specific features
jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

// Configure which features are enabled
mockHasPremiumFeature.mockImplementation((feature) => {
  const enabledFeatures = ["remote_sync", "advanced_permissions"];
  return enabledFeatures.includes(feature);
});

// Initialize enterprise plugins (uses mocked hasPremiumFeature)
initializeRemoteSyncPlugin();
initializeFeatureLevelPermissionsPlugin();
initializeTransformsPlugin();
initializeDependenciesPlugin();

interface SetupEndpointsOpts {
  isNavbarOpened?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  remoteSyncType?: "read-only" | "read-write";
  hasDirtyChanges?: boolean;
}

const setupEndpoints = ({
  isNavbarOpened = true,
  remoteSyncEnabled = false,
  remoteSyncBranch = null,
  remoteSyncType = "read-write",
  hasDirtyChanges = false,
}: SetupEndpointsOpts = {}) => {
  // Mock session properties for settings (used by useAdminSetting and useSetting)
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": remoteSyncBranch,
      "remote-sync-type": remoteSyncType,
    }),
  );

  // Mock settings details endpoint
  setupSettingsEndpoints([]);

  // Mock collection tree endpoint (used by useHasLibraryDirtyChanges)
  fetchMock.get("path:/api/collection/tree", () => {
    if (hasDirtyChanges) {
      return [
        createMockCollection({
          id: 1,
          name: "Library",
          type: "library",
        }),
      ];
    }
    return [];
  });

  // Mock remote sync dirty endpoint (used by useRemoteSyncDirtyState)
  fetchMock.get("path:/api/ee/remote-sync/dirty", () => {
    if (hasDirtyChanges) {
      return {
        dirty: [{ id: 1, model: "card", collection_id: 1 }],
      };
    }
    return { dirty: [] };
  });

  // Mock remote sync current task endpoint (used by useSyncStatus)
  fetchMock.get("path:/api/ee/remote-sync/current-task", {
    status: 404,
    body: { message: "No current task" },
  });

  // Mock remote sync branches endpoint (used by GitSyncControls)
  fetchMock.get("path:/api/ee/remote-sync/branches", {
    branches: remoteSyncBranch ? [remoteSyncBranch] : [],
  });

  // Mock user key value endpoint for sidebar state
  fetchMock.get(
    "express:/api/user-key-value/namespace/data_studio/key/isNavbarOpened",
    new Response(JSON.stringify(isNavbarOpened), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  // Mock user key value PUT endpoint
  fetchMock.put(
    "express:/api/user-key-value/namespace/data_studio/key/isNavbarOpened",
    { status: 200 },
  );
};

const createStoreState = ({
  isAdmin = true,
  remoteSyncEnabled = false,
  remoteSyncBranch = null as string | null,
  remoteSyncType = "read-write" as "read-only" | "read-write",
  canAccessDataModel = true,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncBranch?: string | null;
  remoteSyncType?: "read-only" | "read-write";
  canAccessDataModel?: boolean;
} = {}) => {
  return createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      permissions: {
        can_access_data_model: canAccessDataModel,
        can_access_db_details: false,
      },
    }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": remoteSyncBranch,
      "remote-sync-type": remoteSyncType,
    }),
  });
};

interface SetupOpts {
  isGitSyncVisible?: boolean;
  isGitSettingsVisible?: boolean;
  isAdmin?: boolean;
  hasDirtyChanges?: boolean;
  isNavbarOpened?: boolean;
}

const setup = ({
  isGitSyncVisible = false,
  isGitSettingsVisible = false,
  isAdmin = true,
  hasDirtyChanges = false,
  isNavbarOpened = true,
}: SetupOpts = {}) => {
  // Derive API state from the visibility flags
  // useGitSyncVisible returns isVisible when: isAdmin && remoteSyncEnabled && currentBranch && syncType === "read-write"
  // useGitSettingsVisible returns true when: isAdmin && !remoteSyncEnabled
  let remoteSyncEnabled: boolean;
  let remoteSyncBranch: string | null;
  const remoteSyncType = "read-write" as const;

  if (isGitSyncVisible) {
    // Git sync visible requires: enabled + branch + admin + read-write
    remoteSyncEnabled = true;
    remoteSyncBranch = "main";
  } else if (isGitSettingsVisible) {
    // Git settings visible requires: admin + NOT enabled
    remoteSyncEnabled = false;
    remoteSyncBranch = null;
  } else {
    // Neither visible - could be enabled with no branch, or not admin
    remoteSyncEnabled = true;
    remoteSyncBranch = null;
  }

  setupEndpoints({
    isNavbarOpened,
    remoteSyncEnabled,
    remoteSyncBranch,
    remoteSyncType,
    hasDirtyChanges,
  });

  renderWithProviders(
    <DataStudioLayout>
      <div data-testid="content">Content</div>
    </DataStudioLayout>,
    {
      storeInitialState: createStoreState({
        isAdmin,
        remoteSyncEnabled,
        remoteSyncBranch,
        remoteSyncType,
        canAccessDataModel: isAdmin,
      }),
      withRouter: false,
    },
  );
};

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
      setup({ isGitSettingsVisible: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByLabelText("Set up git sync")).toBeInTheDocument();
    });

    it("should hide Set up git sync button when git settings is not visible", async () => {
      setup({ isGitSettingsVisible: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(
        screen.queryByLabelText("Set up git sync"),
      ).not.toBeInTheDocument();
    });

    it("should open modal when Set up git sync button is clicked", async () => {
      setup({ isGitSettingsVisible: true });

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
      setup({ isGitSettingsVisible: true });

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
      setup({ isGitSettingsVisible: true, isNavbarOpened: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Set up git sync")).toBeInTheDocument();
    });
  });

  describe("sidebar rendering", () => {
    it("should render the sidebar with navigation tabs", async () => {
      setup({ isGitSyncVisible: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Library")).toBeInTheDocument();
      expect(screen.getByText("Exit")).toBeInTheDocument();
    });

    it("should render GitSyncAppBarControls when sidebar is expanded", async () => {
      setup({ isGitSyncVisible: true, isNavbarOpened: true });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
    });

    it("should not render GitSyncAppBarControls when sidebar is collapsed", async () => {
      setup({ isGitSyncVisible: true, isNavbarOpened: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("git-sync-controls")).not.toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup({ isGitSyncVisible: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });
});
