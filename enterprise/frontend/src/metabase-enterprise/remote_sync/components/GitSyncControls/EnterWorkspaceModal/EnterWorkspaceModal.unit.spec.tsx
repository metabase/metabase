import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCreateBranchEndpoint,
  setupCreateWorkspaceEndpoint,
  setupListWorkspacesEndpoint,
  setupRemoteSyncBranchesEndpoint,
  setupRemoteSyncImportEndpoint,
  setupUserEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncTask } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { EnterWorkspaceModal } from "./EnterWorkspaceModal";

const CURRENT_USER = createMockUser({ id: 1, is_superuser: true });

const successfulImportTask: RemoteSyncTask = {
  id: 1,
  sync_task_type: "import",
  status: "successful",
  progress: 1,
  started_at: "2026-01-01T00:00:00Z",
  ended_at: "2026-01-01T00:00:05Z",
  last_progress_report_at: null,
  error_message: null,
  initiated_by: 1,
  outcome: { kind: "pulled", count: 3, branch: "feature/new" },
};

function setupCurrentTask(task: RemoteSyncTask) {
  fetchMock.removeRoute("remote-sync-current-task");
  fetchMock.get("path:/api/ee/remote-sync/current-task", task, {
    name: "remote-sync-current-task",
  });
}

function setup({
  branches = ["main"],
  workspaces = [],
  currentWorkspaceId = null,
  currentTask = successfulImportTask,
}: {
  branches?: string[];
  workspaces?: ReturnType<typeof createMockWorkspace>[];
  currentWorkspaceId?: number | null;
  currentTask?: RemoteSyncTask;
} = {}) {
  setupEnterprisePlugins();
  setupRemoteSyncBranchesEndpoint(branches);
  setupListWorkspacesEndpoint(workspaces);
  setupCreateBranchEndpoint();
  setupCreateWorkspaceEndpoint(
    createMockWorkspace({ id: 99, branch: "feature/new" }),
  );
  setupUserEndpoints(CURRENT_USER);
  setupRemoteSyncImportEndpoint();
  setupCurrentTask(currentTask);

  const onClose = jest.fn();

  // The real modal is controlled by GitSyncControls; mirror that here so onClose actually closes it and
  // we can assert the form goes away once the workspace is entered.
  function TestHost() {
    const [opened, setOpened] = useState(true);
    return (
      <EnterWorkspaceModal
        opened={opened}
        currentWorkspaceId={currentWorkspaceId}
        onClose={() => {
          setOpened(false);
          onClose();
        }}
      />
    );
  }

  renderWithProviders(<TestHost />, {
    storeInitialState: createMockState({
      currentUser: CURRENT_USER,
      settings: mockSettings({
        "token-features": createMockTokenFeatures({ remote_sync: true }),
        "remote-sync-enabled": true,
        "remote-sync-branch": "main",
        "remote-sync-type": "read-write",
      }),
    }),
  });

  return { onClose };
}

async function pickExistingBranch(branch: string) {
  await userEvent.click(await screen.findByLabelText(/Branch/));
  await userEvent.click(await screen.findByRole("option", { name: branch }));
}

async function typeNewBranch(branch: string) {
  const input = await screen.findByLabelText(/Branch/);
  await userEvent.click(input);
  await userEvent.type(input, branch);
  await userEvent.click(
    await screen.findByRole("option", {
      name: new RegExp(`Create branch "${branch}"`),
    }),
  );
}

describe("EnterWorkspaceModal", () => {
  describe("dynamic submit label", () => {
    it("reads 'Enter workspace' when a workspace already exists for the branch", async () => {
      setup({
        branches: ["main"],
        workspaces: [createMockWorkspace({ id: 5, branch: "feature/ws" })],
      });
      await pickExistingBranch("feature/ws");

      expect(
        await screen.findByRole("button", { name: "Enter workspace" }),
      ).toBeInTheDocument();
    });

    it("reads 'Create workspace' when the branch exists but has no workspace", async () => {
      setup({ branches: ["main", "feature/bare"], workspaces: [] });
      await pickExistingBranch("feature/bare");

      expect(
        await screen.findByRole("button", { name: "Create workspace" }),
      ).toBeInTheDocument();
    });

    it("reads 'Create branch and workspace' when the branch does not exist", async () => {
      setup({ branches: ["main"], workspaces: [] });
      await typeNewBranch("feature/new");

      expect(
        await screen.findByRole("button", {
          name: "Create branch and workspace",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("entering a new branch", () => {
    it("creates the branch and workspace, enters it, then auto-pulls and closes", async () => {
      const { onClose } = setup({ branches: ["main"], workspaces: [] });
      await typeNewBranch("feature/new");
      await userEvent.click(
        screen.getByRole("button", { name: "Create branch and workspace" }),
      );

      // Branch created first.
      await waitFor(() => {
        expect(
          fetchMock.callHistory.calls("path:/api/ee/remote-sync/branch", {
            method: "POST",
          }),
        ).toHaveLength(1);
      });
      // Workspace created.
      await waitFor(async () => {
        const call = fetchMock.callHistory.lastCall("path:/api/ee/workspace", {
          method: "POST",
        });
        expect(await call?.request?.json()).toEqual({ branch: "feature/new" });
      });
      // Current user assigned to the workspace.
      await waitFor(async () => {
        const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
          method: "PUT",
        });
        expect(await call?.request?.json()).toEqual({ workspace_id: 99 });
      });
      // Auto-pull triggered.
      await waitFor(() => {
        expect(
          fetchMock.callHistory.done("path:/api/ee/remote-sync/import"),
        ).toBe(true);
      });
      // The modal hands off to the app-level sync-status modal and closes: the branch form must not
      // linger over the pull progress.
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /workspace/ }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("entering an existing workspace", () => {
    it("skips branch and workspace creation and enters directly", async () => {
      setup({
        branches: ["main", "feature/ws"],
        workspaces: [createMockWorkspace({ id: 7, branch: "feature/ws" })],
      });
      await pickExistingBranch("feature/ws");
      await userEvent.click(
        screen.getByRole("button", { name: "Enter workspace" }),
      );

      await waitFor(async () => {
        const call = fetchMock.callHistory.lastCall("path:/api/user/1", {
          method: "PUT",
        });
        expect(await call?.request?.json()).toEqual({ workspace_id: 7 });
      });
      expect(
        fetchMock.callHistory.calls("path:/api/ee/remote-sync/branch", {
          method: "POST",
        }),
      ).toHaveLength(0);
      expect(
        fetchMock.callHistory.calls("path:/api/ee/workspace", {
          method: "POST",
        }),
      ).toHaveLength(0);
    });
  });
});
