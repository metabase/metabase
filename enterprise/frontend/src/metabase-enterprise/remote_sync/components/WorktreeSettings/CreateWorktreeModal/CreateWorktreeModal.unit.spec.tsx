import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorktreeEndpoint,
  setupListWorktreesEndpoint,
  setupRemoteSyncBranchesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockRemoteSyncWorktree,
  createMockSettings,
} from "metabase-types/api/mocks";

import { CreateWorktreeModal } from "./CreateWorktreeModal";

const BRANCHES = ["main", "feature/used", "feature/available"];

async function setup() {
  setupRemoteSyncBranchesEndpoint(BRANCHES);
  setupListWorktreesEndpoint([
    createMockRemoteSyncWorktree({ id: 1, branch: "feature/used" }),
  ]);
  setupCreateWorktreeEndpoint(
    createMockRemoteSyncWorktree({ branch: "feature/available" }),
  );
  fetchMock.post("path:/api/ee/remote-sync/branch", {});

  const onClose = jest.fn();
  renderWithProviders(<CreateWorktreeModal opened onClose={onClose} />, {
    storeInitialState: createMockState({
      settings: mockSettings(
        createMockSettings({ "remote-sync-branch": "main" }),
      ),
    }),
  });

  await screen.findByLabelText(/Branch/);
  return { onClose };
}

async function openBranchSelect() {
  await userEvent.click(screen.getByLabelText(/Branch/));
}

async function selectExistingBranch(branch: string) {
  await openBranchSelect();
  await userEvent.click(await screen.findByRole("option", { name: branch }));
}

async function createNewBranch(branch: string) {
  const input = screen.getByLabelText(/Branch/);
  await userEvent.click(input);
  await userEvent.type(input, branch);
  await userEvent.click(
    await screen.findByRole("option", {
      name: new RegExp(`Create new branch.*${branch}`),
    }),
  );
}

async function clickCreate() {
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
}

describe("CreateWorktreeModal", () => {
  it("should disable submit until a branch is selected", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should reject the main branch with its own message", async () => {
    await setup();
    await selectExistingBranch("main");
    await userEvent.tab();

    expect(
      await screen.findByText(
        "You can't create a worktree for the main branch.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should reject an already-used branch with its own message", async () => {
    await setup();
    await selectExistingBranch("feature/used");
    await userEvent.tab();

    expect(
      await screen.findByText("A worktree already exists for this branch."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should create the branch and then the worktree for a brand new branch name", async () => {
    const { onClose } = await setup();
    await createNewBranch("feature/new-branch");
    await clickCreate();

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/remote-sync/branch",
        { method: "POST" },
      );
      expect(await call?.request?.json()).toEqual({
        name: "feature/new-branch",
      });
    });
    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/remote-sync/worktree",
        { method: "POST" },
      );
      expect(await call?.request?.json()).toEqual({
        branch: "feature/new-branch",
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("should only create the worktree for an existing, unused, non-main branch", async () => {
    const { onClose } = await setup();
    await selectExistingBranch("feature/available");
    await clickCreate();

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/remote-sync/worktree",
        { method: "POST" },
      );
      expect(await call?.request?.json()).toEqual({
        branch: "feature/available",
      });
    });
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/branch", {
        method: "POST",
      }),
    ).toHaveLength(0);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
