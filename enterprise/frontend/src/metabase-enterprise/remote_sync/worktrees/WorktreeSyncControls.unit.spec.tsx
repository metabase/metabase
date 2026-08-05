import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockWorktree,
} from "metabase-types/api/mocks";

import { WorktreeSyncControls } from "./WorktreeSyncControls";

const WORKTREE = createMockWorktree({ id: 5, branch: "feature-branch" });

type SetupOpts = {
  isDirty?: boolean;
  hasRemoteChanges?: boolean;
};

function setup({ isDirty = false, hasRemoteChanges = false }: SetupOpts = {}) {
  setupEnterprisePlugins();
  setupRemoteSyncEndpoints({
    branches: ["main", "feature-branch"],
    isDirty,
    hasRemoteChanges,
  });

  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ remote_sync: true }),
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
  });
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  fetchMock.get("path:/api/ee/library", { data: null });

  return renderWithProviders(<WorktreeSyncControls worktree={WORKTREE} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings(settings),
    }),
  });
}

describe("WorktreeSyncControls", () => {
  it("shows Up to date when there is nothing to sync", async () => {
    setup();

    expect(await screen.findByTestId("worktree-sync-status")).toHaveTextContent(
      "Up to date",
    );
    expect(
      screen.queryByTestId("worktree-incoming-changes"),
    ).not.toBeInTheDocument();
  });

  it("shows Uncommitted changes when the worktree is dirty", async () => {
    setup({ isDirty: true });

    expect(await screen.findByTestId("worktree-sync-status")).toHaveTextContent(
      "Uncommitted changes",
    );
  });

  it("shows the incoming-changes indicator when the remote has new commits", async () => {
    setup({ hasRemoteChanges: true });

    expect(
      await screen.findByTestId("worktree-incoming-changes"),
    ).toHaveTextContent("Remote changes to pull");
  });
});
