import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { RemoteSyncType } from "metabase-types/api";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { SyncActionsSection } from "./SyncActionsSection";

type SetupOpts = {
  isEnabled?: boolean;
  syncType?: RemoteSyncType;
};

const setup = ({
  isEnabled = true,
  syncType = "read-only",
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": isEnabled,
    "remote-sync-url": isEnabled ? "https://github.com/acme/metabase.git" : "",
    "remote-sync-type": syncType,
  });

  setupPropertiesEndpoints(settings);
  setupRemoteSyncEndpoints();

  renderWithProviders(<SyncActionsSection />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings(settings),
    }),
  });
};

const getRequestBody = async (path: string): Promise<unknown> => {
  await waitFor(() =>
    expect(fetchMock.callHistory.calls(`path:${path}`)).toHaveLength(1),
  );
  const [call] = fetchMock.callHistory.calls(`path:${path}`);
  return call?.request?.json();
};

describe("SyncActionsSection", () => {
  it("pulls changes on demand when syncing read-only", async () => {
    setup({ syncType: "read-only" });

    await userEvent.click(
      screen.getByRole("button", { name: "Pull changes now" }),
    );

    expect(await screen.findByText("Pulling changes")).toBeInTheDocument();
    expect(await getRequestBody("/api/ee/remote-sync/import")).toEqual({
      force: true,
    });
  });

  it("doesn't offer to pull on demand when syncing read-write", () => {
    setup({ syncType: "read-write" });

    expect(
      screen.getByRole("button", { name: "Turn off remote sync" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pull changes now" }),
    ).not.toBeInTheDocument();
  });

  it("turns remote sync off after confirmation", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Turn off remote sync" }),
    );
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/settings"),
    ).toHaveLength(0);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Turn off",
      }),
    );

    expect(await getRequestBody("/api/ee/remote-sync/settings")).toEqual({
      "remote-sync-url": null,
    });
  });

  it("renders nothing until remote sync is set up", () => {
    setup({ isEnabled: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
