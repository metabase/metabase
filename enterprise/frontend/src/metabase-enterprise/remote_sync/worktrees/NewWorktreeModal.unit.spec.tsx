import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupRemoteSyncCreateWorktreeEndpoint,
  setupRemoteSyncEndpoints,
  setupRemoteSyncImportEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockWorktree,
} from "metabase-types/api/mocks";

import { NewWorktreeModal } from "./NewWorktreeModal";

const CREATED_WORKTREE = createMockWorktree({ id: 42, branch: "develop" });
const INITIAL_ROUTE = "/data-studio/transforms";

type ApiError = { status: number; message: string };

type SetupOpts = {
  createError?: ApiError;
  importError?: ApiError;
};

function setup({ createError, importError }: SetupOpts = {}) {
  setupRemoteSyncEndpoints({ branches: ["main", "develop"] });
  setupRemoteSyncCreateWorktreeEndpoint({
    worktree: CREATED_WORKTREE,
    error: createError,
  });
  setupRemoteSyncImportEndpoint({ error: importError });
  setupSettingsEndpoints([]);

  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });
  setupPropertiesEndpoints(settings);
  setupEnterprisePlugins();

  const onClose = jest.fn();
  const { store, router } = renderWithProviders(
    <NewWorktreeModal onClose={onClose} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
      withRouter: true,
      initialRoute: INITIAL_ROUTE,
    },
  );

  return { onClose, store, router };
}

async function submitBranch(branch: string) {
  // The branch input is disabled until the branch list has loaded.
  const input = await screen.findByRole("textbox", { name: "Branch" });
  await waitFor(() => expect(input).toBeEnabled());
  await userEvent.type(input, branch);
  await userEvent.click(
    screen.getByRole("button", { name: "Create worktree" }),
  );
}

function getToastMessages(store: ReturnType<typeof setup>["store"]) {
  return store.getState().undo.map((undo) => String(undo.message));
}

async function lastRequestBody(path: string) {
  const request = fetchMock.callHistory.lastCall(path, {
    method: "POST",
  })?.request;
  return request?.json();
}

describe("NewWorktreeModal", () => {
  it("creates a worktree for an existing branch, pulls the branch into it, and navigates into it", async () => {
    const { onClose, router } = setup();

    await submitBranch("develop");

    await waitFor(() => {
      expect(router?.location.pathname).toBe(
        "/data-studio/worktrees/42/transforms",
      );
    });
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/create-branch"),
    ).toBe(false);
    expect(await lastRequestBody("path:/api/ee/remote-sync/worktree")).toEqual({
      branch: "develop",
    });
    expect(await lastRequestBody("path:/api/ee/remote-sync/import")).toEqual({
      expected_branch: "develop",
      worktree_id: 42,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates the branch first when it does not exist yet", async () => {
    const { router } = setup();

    await submitBranch("feature/new");
    expect(
      screen.getByText('The branch "feature/new" will be created.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(router?.location.pathname).toBe(
        "/data-studio/worktrees/42/transforms",
      );
    });
    expect(
      await lastRequestBody("path:/api/ee/remote-sync/create-branch"),
    ).toEqual({ name: "feature/new", checkout: false });
    expect(await lastRequestBody("path:/api/ee/remote-sync/worktree")).toEqual({
      branch: "feature/new",
    });
  });

  it("reports a failed first pull with a toast and still opens the new worktree so it can be pulled again", async () => {
    const { onClose, store, router } = setup({
      importError: { status: 400, message: "Another sync task is running" },
    });

    await submitBranch("develop");

    await waitFor(() => {
      expect(getToastMessages(store)).toContain(
        'Worktree created, but pulling "develop" failed: Another sync task is running',
      );
    });
    expect(router?.location.pathname).toBe(
      "/data-studio/worktrees/42/transforms",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open and toasts when creating the worktree fails", async () => {
    const { onClose, store, router } = setup({
      createError: { status: 400, message: "Branch is already checked out" },
    });

    await submitBranch("develop");

    await waitFor(() => {
      expect(getToastMessages(store)).toContain(
        "Branch is already checked out",
      );
    });
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/import"),
    ).toBe(false);
    expect(router?.location.pathname).toBe(INITIAL_ROUTE);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create worktree" }),
    ).toBeEnabled();
  });

  it("disables the submit button until a branch is entered", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: "Create worktree" }),
    ).toBeDisabled();
  });

  it("closes on cancel without creating anything", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.callHistory.called("path:/api/ee/remote-sync/worktree", {
        method: "POST",
      }),
    ).toBe(false);
  });
});
