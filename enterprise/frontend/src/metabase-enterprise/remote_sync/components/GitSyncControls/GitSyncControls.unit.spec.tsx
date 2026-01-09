import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { GitSyncControls } from "./GitSyncControls";
import {
  createMockDirtyEntity,
  createRemoteSyncStoreState,
  setupCollectionEndpoints,
  setupSessionEndpoints,
} from "./test-utils";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  hasRemoteChanges = true,
  currentBranch = "main",
  syncType = "read-write",
  dirty = [],
  branches = ["main", "develop"],
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  hasRemoteChanges?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
  dirty?: ReturnType<typeof createMockDirtyEntity>[];
  branches?: string[];
} = {}) => {
  setupRemoteSyncEndpoints({ branches, dirty, hasRemoteChanges });
  setupCollectionEndpoints();
  setupSessionEndpoints({ remoteSyncEnabled, currentBranch, syncType });

  return renderWithProviders(<GitSyncControls />, {
    storeInitialState: createRemoteSyncStoreState({
      isAdmin,
      remoteSyncEnabled,
      currentBranch,
      syncType,
    }),
  });
};

const findOption = (name: RegExp) => screen.findByRole("option", { name });
const getBranchButton = (name: RegExp) => screen.getByRole("button", { name });
const queryBranchButton = (name: RegExp) =>
  screen.queryByRole("button", { name });

describe("GitSyncControls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("visibility", () => {
    it("should not render when remote sync is disabled", async () => {
      setup({ remoteSyncEnabled: false });

      // Wait a tick to ensure component has rendered
      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when user is not admin", async () => {
      setup({ isAdmin: false });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when currentBranch is null", async () => {
      setup({ currentBranch: null });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when sync type is read-only", async () => {
      setup({ syncType: "read-only" });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should render pill when all conditions are met", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
    });
  });

  describe("git sync button", () => {
    it("should display current branch name", async () => {
      setup({ currentBranch: "main" });
      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
    });

    it("should display different branch name", async () => {
      setup({ currentBranch: "develop" });
      await waitFor(() => {
        expect(getBranchButton(/develop/)).toBeInTheDocument();
      });

      expect(queryBranchButton(/main/)).not.toBeInTheDocument();
    });

    it("should open dropdown when clicked", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });

      await userEvent.click(getBranchButton(/main/));

      expect(await findOption(/Push changes/)).toBeInTheDocument();
      expect(await findOption(/Pull changes/)).toBeInTheDocument();
      expect(await findOption(/Switch branch/)).toBeInTheDocument();
    });
  });

  describe("push option", () => {
    it("should be enabled when there are changes", async () => {
      setup({ dirty: [createMockDirtyEntity()] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));

      expect(await findOption(/Push changes/)).toBeEnabled();
    });

    it("should be disabled and show proper tooltip when there are no changes", async () => {
      setup({ dirty: [] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Push changes/)).toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );

      await userEvent.hover(await findOption(/Push changes/));
      expect(
        await screen.findByRole("tooltip", { name: "No changes to push" }),
      ).toBeInTheDocument();
    });

    it("should open push modal when clicked with changes", async () => {
      setup({ dirty: [createMockDirtyEntity()] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Push changes/));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });
  });

  describe("pull option", () => {
    it("should call import mutation when clicked", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Pull changes/));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done("path:/api/ee/remote-sync/import"),
        ).toBe(true);
      });
    });

    it("is enabled when there are changes to pull", async () => {
      setup({ hasRemoteChanges: true });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Pull changes/)).not.toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );
    });

    it("is disabled when there are no changes to pull", async () => {
      setup({ hasRemoteChanges: false });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Pull changes/)).toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );
    });
  });

  describe("switch branch option", () => {
    it("should show branch dropdown when switch branch is clicked", async () => {
      setup({ branches: ["main", "develop", "feature-1"] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Switch branch/));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });
    });
  });
});
