import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DataStudioLayout } from "./DataStudioLayout";

// Mock CollectionSyncStatusBadge to simplify the test
jest.mock(
  "metabase-enterprise/remote_sync/components/SyncedCollectionsSidebarSection/CollectionSyncStatusBadge",
  () => ({
    CollectionSyncStatusBadge: () => (
      <div data-testid="sync-status-badge">Badge</div>
    ),
  }),
);

// Store original plugin values
const originalGitSettingsModal = PLUGIN_REMOTE_SYNC.GitSettingsModal;
const originalGitSyncAppBarControls = PLUGIN_REMOTE_SYNC.GitSyncAppBarControls;
const originalUseGitSyncVisible = PLUGIN_REMOTE_SYNC.useGitSyncVisible;
const originalUseGitSettingsVisible = PLUGIN_REMOTE_SYNC.useGitSettingsVisible;
const originalUseHasLibraryDirtyChanges =
  PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges;
const originalDependenciesIsEnabled = PLUGIN_DEPENDENCIES.isEnabled;
const originalCanAccessDataModel =
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel;
const originalCanAccessTransforms = PLUGIN_TRANSFORMS.canAccessTransforms;

// Mock functions
const mockUseGitSyncVisible = jest.fn();
const mockUseGitSettingsVisible = jest.fn();
const mockUseHasLibraryDirtyChanges = jest.fn();

// Mock components for the plugin
const MockGitSettingsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) =>
  isOpen ? (
    <div data-testid="git-settings-modal">
      <button onClick={onClose} data-testid="close-modal-button">
        Close Modal
      </button>
    </div>
  ) : null;

const MockGitSyncAppBarControls = () => (
  <div data-testid="git-sync-app-bar-controls">Git Sync Controls</div>
);

const setupEndpoints = ({
  isNavbarOpened = true,
}: { isNavbarOpened?: boolean } = {}) => {
  // Mock collection tree endpoint
  fetchMock.get("path:/api/collection/tree", []);

  // Mock user key value endpoint for sidebar state
  // The API returns the value directly, not wrapped in an object
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
}: {
  isAdmin?: boolean;
} = {}) => {
  return createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "remote-sync-type": "read-write",
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
  setupEndpoints({ isNavbarOpened });

  // Setup plugin hooks mocks
  mockUseGitSyncVisible.mockReturnValue(isGitSyncVisible);
  mockUseGitSettingsVisible.mockReturnValue(isGitSettingsVisible);
  mockUseHasLibraryDirtyChanges.mockReturnValue(hasDirtyChanges);

  // Setup plugin mocks
  PLUGIN_REMOTE_SYNC.GitSettingsModal = MockGitSettingsModal;
  PLUGIN_REMOTE_SYNC.GitSyncAppBarControls = MockGitSyncAppBarControls;
  PLUGIN_REMOTE_SYNC.useGitSyncVisible = mockUseGitSyncVisible;
  PLUGIN_REMOTE_SYNC.useGitSettingsVisible = mockUseGitSettingsVisible;
  PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges = mockUseHasLibraryDirtyChanges;

  // Setup feature permissions to return simple values
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel = () => isAdmin;
  PLUGIN_TRANSFORMS.canAccessTransforms = () => false;
  PLUGIN_DEPENDENCIES.isEnabled = false;

  renderWithProviders(
    <DataStudioLayout>
      <div data-testid="content">Content</div>
    </DataStudioLayout>,
    {
      storeInitialState: createStoreState({ isAdmin }),
      // Don't use withRouter - it causes rendering issues in tests
      withRouter: false,
    },
  );
};

describe("DataStudioLayout", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    jest.clearAllMocks();
    // Suppress console.error for router warnings
    jest.spyOn(console, "error").mockImplementation(() => {});
    // Suppress console.warn for selector warnings
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original plugin implementations
    PLUGIN_REMOTE_SYNC.GitSettingsModal = originalGitSettingsModal;
    PLUGIN_REMOTE_SYNC.GitSyncAppBarControls = originalGitSyncAppBarControls;
    PLUGIN_REMOTE_SYNC.useGitSyncVisible = originalUseGitSyncVisible;
    PLUGIN_REMOTE_SYNC.useGitSettingsVisible = originalUseGitSettingsVisible;
    PLUGIN_REMOTE_SYNC.useHasLibraryDirtyChanges =
      originalUseHasLibraryDirtyChanges;
    PLUGIN_DEPENDENCIES.isEnabled = originalDependenciesIsEnabled;
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel =
      originalCanAccessDataModel;
    PLUGIN_TRANSFORMS.canAccessTransforms = originalCanAccessTransforms;
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
        expect(screen.getByTestId("git-settings-modal")).toBeInTheDocument();
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
        expect(screen.getByTestId("git-settings-modal")).toBeInTheDocument();
      });

      // Close the modal
      const closeButton = screen.getByTestId("close-modal-button");
      await userEvent.click(closeButton);

      await waitFor(() => {
        expect(
          screen.queryByTestId("git-settings-modal"),
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

      expect(
        screen.getByTestId("git-sync-app-bar-controls"),
      ).toBeInTheDocument();
    });

    it("should not render GitSyncAppBarControls when sidebar is collapsed", async () => {
      setup({ isGitSyncVisible: true, isNavbarOpened: false });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("git-sync-app-bar-controls"),
      ).not.toBeInTheDocument();
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
