import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RemoteSyncEntity, RemoteSyncType } from "metabase-types/api";
import {
  createMockRemoteSyncEntity,
  createMockRemoteSyncTask,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AppBarControls } from "./AppBarControls";

type SetupOpts = {
  syncType?: RemoteSyncType;
  dirty?: RemoteSyncEntity[];
  hasRemoteChanges?: boolean;
};

const setup = ({
  syncType = "read-write",
  dirty = [],
  hasRemoteChanges = false,
}: SetupOpts = {}) => {
  setupRemoteSyncEndpoints({
    dirty,
    hasRemoteChanges,
    currentTask: createMockRemoteSyncTask({ id: 1, progress: 0.5 }),
  });

  renderWithProviders(<AppBarControls />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings(
        createMockSettings({
          "remote-sync-enabled": true,
          "remote-sync-branch": "main",
          "remote-sync-type": syncType,
        }),
      ),
    }),
  });
};

const wasCalled = (path: string) =>
  fetchMock.callHistory.called(`path:/api/ee/remote-sync/${path}`);

const openSyncMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: /Sync/ }));
  return screen.findByRole("menu");
};

describe("AppBarControls", () => {
  it("renders nothing on read-only instances", () => {
    setup({ syncType: "read-only" });

    expect(screen.queryByTestId("git-sync-controls")).not.toBeInTheDocument();
  });

  it("fetches pull and push status only once menu opens", async () => {
    setup();

    expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
    expect(wasCalled("is-dirty")).toBe(false);
    expect(wasCalled("has-remote-changes")).toBe(false);
    expect(wasCalled("branches")).toBe(false);

    await openSyncMenu();

    await waitFor(() => expect(wasCalled("is-dirty")).toBe(true));
    expect(wasCalled("has-remote-changes")).toBe(true);
  });

  it("disables pulling and pushing when there is nothing to pull or push", async () => {
    setup();
    await openSyncMenu();

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /Pull changes/ }),
      ).toBeDisabled(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /Push changes/ }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole("menuitem", { name: /Push to a new branch/ }),
    ).toBeEnabled();
  });

  it("enables pulling and pushing when there are changes", async () => {
    setup({ dirty: [createMockRemoteSyncEntity()], hasRemoteChanges: true });
    await openSyncMenu();

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /Pull changes/ }),
      ).toBeEnabled(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /Push changes/ }),
      ).toBeEnabled(),
    );
  });

  it("pulls right away without unpushed changes and shows task progress", async () => {
    setup({ hasRemoteChanges: true });
    await openSyncMenu();
    const pullItem = screen.getByRole("menuitem", { name: /Pull changes/ });
    await waitFor(() => expect(pullItem).toBeEnabled());

    await userEvent.click(pullItem);

    expect(await screen.findByText("Pulling changes")).toBeInTheDocument();
    const [importCall] = fetchMock.callHistory.calls(
      "path:/api/ee/remote-sync/import",
    );
    expect(await importCall?.request?.json()).toEqual({
      branch: "main",
      expected_branch: "main",
    });
  });

  it("asks what to do with unpushed changes before pulling", async () => {
    setup({ dirty: [createMockRemoteSyncEntity()], hasRemoteChanges: true });
    await openSyncMenu();
    const pullItem = screen.getByRole("menuitem", { name: /Pull changes/ });
    await waitFor(() => expect(pullItem).toBeEnabled());

    await userEvent.click(pullItem);
    await userEvent.click(
      await screen.findByRole("button", { name: "Keep my changes" }),
    );

    expect(await screen.findByText("Pulling changes")).toBeInTheDocument();
    const [importCall] = fetchMock.callHistory.calls(
      "path:/api/ee/remote-sync/import",
    );
    expect(await importCall?.request?.json()).toEqual({
      branch: "main",
      expected_branch: "main",
      merge: true,
      force: false,
    });
  });

  it("lists branches when branch select opens and switches branches", async () => {
    setup();

    await userEvent.click(screen.getByRole("textbox", { name: "Branch" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "develop" }),
    );

    expect(wasCalled("branches")).toBe(true);
    expect(await screen.findByText("Switching to develop")).toBeInTheDocument();
    const [importCall] = fetchMock.callHistory.calls(
      "path:/api/ee/remote-sync/import",
    );
    expect(await importCall?.request?.json()).toEqual({
      branch: "develop",
      expected_branch: "main",
    });
  });
});
