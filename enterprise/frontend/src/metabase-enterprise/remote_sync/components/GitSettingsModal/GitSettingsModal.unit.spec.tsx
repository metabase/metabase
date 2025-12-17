import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { GitSettingsModal } from "./GitSettingsModal";

const createMockLibraryCollection = (
  overrides?: Partial<Collection>,
): Collection =>
  createMockCollection({
    id: 999,
    name: "Library",
    type: "library",
    ...overrides,
  });

const setupEndpoints = ({
  remoteSyncEnabled = false,
  remoteSyncUrl = "",
  remoteSyncToken = "",
  remoteSyncType = "read-only" as const,
  remoteSyncBranch = "main",
  remoteSyncAutoImport = false,
  libraryCollection = null as Collection | null,
  dirty = [] as any[],
}: {
  remoteSyncEnabled?: boolean;
  remoteSyncUrl?: string;
  remoteSyncToken?: string;
  remoteSyncType?: "read-only" | "read-write";
  remoteSyncBranch?: string;
  remoteSyncAutoImport?: boolean;
  libraryCollection?: Collection | null;
  dirty?: any[];
} = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": remoteSyncEnabled,
    "remote-sync-url": remoteSyncUrl,
    "remote-sync-token": remoteSyncToken,
    "remote-sync-type": remoteSyncType,
    "remote-sync-branch": remoteSyncBranch,
    "remote-sync-auto-import": remoteSyncAutoImport,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  // Mock the library collection endpoint
  fetchMock.get("express:/api/ee/library", libraryCollection ?? { data: null });

  // Mock the dirty changes endpoint
  fetchMock.get("path:/api/ee/remote-sync/dirty", { dirty });

  // Mock the update settings endpoint
  fetchMock.put("path:/api/ee/remote-sync/settings", { success: true });
};

const createStoreState = ({
  isAdmin = true,
  remoteSyncEnabled = false,
  remoteSyncType = "read-only" as const,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  remoteSyncType?: "read-only" | "read-write";
} = {}) => {
  return createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-type": remoteSyncType,
    }),
  });
};

interface SetupOpts {
  isOpen?: boolean;
  onClose?: () => void;
  remoteSyncEnabled?: boolean;
  remoteSyncUrl?: string;
  remoteSyncToken?: string;
  remoteSyncType?: "read-only" | "read-write";
  remoteSyncBranch?: string;
  libraryCollection?: Collection | null;
  dirty?: any[];
}

const setup = ({
  isOpen = true,
  onClose = jest.fn(),
  remoteSyncEnabled = false,
  remoteSyncUrl = "",
  remoteSyncToken = "",
  remoteSyncType = "read-only",
  remoteSyncBranch = "main",
  libraryCollection = null,
  dirty = [],
}: SetupOpts = {}) => {
  setupEndpoints({
    remoteSyncEnabled,
    remoteSyncUrl,
    remoteSyncToken,
    remoteSyncType,
    remoteSyncBranch,
    libraryCollection,
    dirty,
  });

  renderWithProviders(<GitSettingsModal isOpen={isOpen} onClose={onClose} />, {
    storeInitialState: createStoreState({
      remoteSyncEnabled,
      remoteSyncType,
    }),
  });

  return { onClose };
};

describe("GitSettingsModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("modal rendering", () => {
    it("should render modal when isOpen is true", async () => {
      setup({ isOpen: true });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      // Modal title displays "Set up remote sync for your Library"
      expect(
        screen.getByText("Set up remote sync for your Library"),
      ).toBeInTheDocument();
      // Modal subtitle displays
      expect(
        screen.getByText(
          "Keep your Library and transforms safely backed up in git.",
        ),
      ).toBeInTheDocument();
    });

    it("should not render modal when isOpen is false", () => {
      setup({ isOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should display Git repository section with URL and Token fields", async () => {
      setup({ isOpen: true });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.getByText("Git repository")).toBeInTheDocument();
      expect(screen.getByLabelText(/Repository URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Access token/i)).toBeInTheDocument();
    });

    it("should display Sync Mode section with radio options", async () => {
      setup({ isOpen: true });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(
        screen.getByText("Sync mode for this instance"),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Read-only")).toBeInTheDocument();
      expect(screen.getByLabelText("Read-write")).toBeInTheDocument();
    });
  });

  describe("conditional branch section", () => {
    it("should show branch settings when read-only mode is selected", async () => {
      setup({ isOpen: true, remoteSyncType: "read-only" });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      expect(screen.getByText("Branch to sync with")).toBeInTheDocument();
      expect(screen.getByLabelText(/Sync branch/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Auto-sync with git/i)).toBeInTheDocument();
    });

    it("should hide branch settings when read-write mode is selected", async () => {
      setup({ isOpen: true, remoteSyncType: "read-write" });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Wait for the form to be fully rendered
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      expect(screen.queryByText("Branch to sync with")).not.toBeInTheDocument();
    });

    it("should show info text when read-write mode is selected", async () => {
      setup({ isOpen: true, remoteSyncType: "read-write" });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Library collection will be enabled for syncing/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe("submit behavior - read-write mode", () => {
    it("should show Save changes button", async () => {
      const libraryCollection = createMockLibraryCollection({ id: 999 });

      setup({
        isOpen: true,
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
        remoteSyncEnabled: true,
        libraryCollection,
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Verify the submit button shows correct text for existing setup
      expect(
        screen.getByRole("button", { name: /Save changes/i }),
      ).toBeInTheDocument();
    });
  });

  describe("submit behavior - read-only mode", () => {
    it("should show Save change button", async () => {
      setup({
        isOpen: true,
        remoteSyncType: "read-only",
        remoteSyncUrl: "",
        remoteSyncEnabled: false,
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Verify the submit button shows correct text for new setup
      expect(
        screen.getByRole("button", { name: /Save changes/i }),
      ).toBeInTheDocument();
    });
  });

  describe("cancel behavior", () => {
    it("should close modal when Cancel is clicked", async () => {
      const onClose = jest.fn();

      setup({
        isOpen: true,
        onClose,
        remoteSyncUrl: "https://github.com/test/repo.git",
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Find the Cancel button (it's a subtle variant button)
      const cancelButton = screen.getByText("Cancel");
      await userEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("read-only mode restriction", () => {
    it("should disable read-only option when there are unsynced changes", async () => {
      const dirty = [
        { id: 1, name: "Test Card", model: "card", sync_status: "update" },
      ];

      setup({
        isOpen: true,
        remoteSyncType: "read-write",
        remoteSyncEnabled: true,
        dirty,
      });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      await waitFor(() => {
        const readOnlyRadio = screen.getByLabelText("Read-only");
        expect(readOnlyRadio).toBeDisabled();
      });
    });
  });
});
