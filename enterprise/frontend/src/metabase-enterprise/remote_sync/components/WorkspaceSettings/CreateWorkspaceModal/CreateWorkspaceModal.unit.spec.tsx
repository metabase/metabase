import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceEndpoint,
  setupListWorkspacesEndpoint,
  setupRemoteSyncBranchesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";

const BRANCHES = ["main", "feature/used", "feature/available"];

async function setup() {
  setupRemoteSyncBranchesEndpoint(BRANCHES);
  setupListWorkspacesEndpoint([
    createMockWorkspace({ id: 1, branch: "feature/used" }),
  ]);
  setupCreateWorkspaceEndpoint(
    createMockWorkspace({ branch: "feature/available" }),
  );

  const onClose = jest.fn();
  renderWithProviders(<CreateWorkspaceModal opened onClose={onClose} />, {
    storeInitialState: createMockState({
      settings: mockSettings(
        createMockSettings({ "remote-sync-branch": "main" }),
      ),
    }),
  });

  await screen.findByLabelText(/Branch/);
  return { onClose };
}

async function selectBranch(branch: string) {
  await userEvent.click(screen.getByLabelText(/Branch/));
  await userEvent.click(await screen.findByRole("option", { name: branch }));
}

async function clickCreate() {
  await userEvent.click(screen.getByRole("button", { name: "Create" }));
}

describe("CreateWorkspaceModal", () => {
  it("should disable submit until a branch is selected", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should list all branches, including the main and already-used ones", async () => {
    await setup();
    await userEvent.click(screen.getByLabelText(/Branch/));

    for (const branch of BRANCHES) {
      expect(
        await screen.findByRole("option", { name: branch }),
      ).toBeInTheDocument();
    }
  });

  it("should reject the main branch with its own message", async () => {
    await setup();
    await selectBranch("main");
    await userEvent.tab();

    expect(
      await screen.findByText(
        "You can't create a workspace for the main branch.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should reject an already-used branch with its own message", async () => {
    await setup();
    await selectBranch("feature/used");
    await userEvent.tab();

    expect(
      await screen.findByText("A workspace already exists for this branch."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should create the workspace for an existing, unused, non-main branch", async () => {
    const { onClose } = await setup();
    await selectBranch("feature/available");
    await clickCreate();

    await waitFor(async () => {
      const call = fetchMock.callHistory.lastCall(
        "path:/api/ee/remote-sync/workspace",
        { method: "POST" },
      );
      expect(await call?.request?.json()).toEqual({
        branch: "feature/available",
      });
    });
    // Branch creation is no longer part of the flow.
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/branch", {
        method: "POST",
      }),
    ).toHaveLength(0);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
