import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RemoteSyncEntity } from "metabase-types/api";

import {
  createMockDirtyEntity,
  createRemoteSyncStoreState,
  setupCollectionEndpoints,
  setupSessionEndpoints,
} from "../GitSyncControls/test-utils";

import { BranchSwitcher } from "./BranchSwitcher";

const setup = ({
  isAdmin = true,
  currentBranch = "main",
  dirty = [],
  branches = ["main", "develop"],
  envVarName,
}: {
  isAdmin?: boolean;
  currentBranch?: string;
  dirty?: RemoteSyncEntity[];
  branches?: string[];
  envVarName?: string;
} = {}) => {
  setupEnterprisePlugins();
  setupRemoteSyncEndpoints({ branches, dirty });
  setupSessionEndpoints({ currentBranch, syncType: "read-write" });
  setupCollectionEndpoints();
  // SyncConflictModal (shown on the dirty path) fetches the library collection.
  fetchMock.get("path:/api/ee/library", { data: null });

  return renderWithProviders(
    <BranchSwitcher
      currentBranch={currentBranch}
      dirty={dirty}
      disabled={Boolean(envVarName)}
      envVarName={envVarName}
    />,
    {
      storeInitialState: createRemoteSyncStoreState({
        isAdmin,
        currentBranch,
        syncType: "read-write",
      }),
    },
  );
};

const openBranchPickerAndSelect = async (branch: string) => {
  await userEvent.click(screen.getByTestId("settings-branch-switcher"));
  await userEvent.type(
    await screen.findByPlaceholderText("Find or create a branch..."),
    branch,
  );
  await userEvent.click(await screen.findByRole("option", { name: branch }));
};

describe("BranchSwitcher", () => {
  it("tells non-admins they need to be an admin instead of showing the control", () => {
    setup({ isAdmin: false });

    expect(
      screen.getByText("You need to be an admin to switch the sync branch."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("settings-branch-switcher"),
    ).not.toBeInTheDocument();
  });

  it("shows the current branch and an unsaved-changes count when dirty", () => {
    setup({ dirty: [createMockDirtyEntity()] });

    expect(screen.getByTestId("settings-branch-switcher")).toHaveTextContent(
      "main",
    );
    expect(
      screen.getByTestId("branch-switcher-dirty-warning"),
    ).toHaveTextContent("1 unsaved change");
  });

  it("explains that the branch is pinned by an env var and disables the control", () => {
    setup({ envVarName: "MB_REMOTE_SYNC_BRANCH" });

    expect(screen.getByText("Using MB_REMOTE_SYNC_BRANCH")).toBeInTheDocument();
    expect(screen.getByTestId("settings-branch-switcher")).toBeDisabled();
  });

  it("switches directly when the instance is clean", async () => {
    setup({ dirty: [] });

    await openBranchPickerAndSelect("develop");

    await waitFor(() => {
      expect(fetchMock.callHistory.called("remote-sync-import")).toBe(true);
    });
    // no choose-what-to-do modal on a clean switch
    expect(
      screen.queryByText(/You have unsynced changes/),
    ).not.toBeInTheDocument();
  });

  it("opens the choose-what-to-do modal when there are unsaved changes", async () => {
    setup({ dirty: [createMockDirtyEntity()] });

    await openBranchPickerAndSelect("develop");

    // the modal (rather than a direct switch) means the unsaved-changes path was taken
    expect(
      await screen.findByText(
        "You have unsynced changes. What do you want to do?",
      ),
    ).toBeInTheDocument();
  });
});
