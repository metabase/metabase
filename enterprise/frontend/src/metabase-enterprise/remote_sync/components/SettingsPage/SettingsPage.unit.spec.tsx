import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { useGetSettingsQuery } from "metabase/settings";
import type {
  EnterpriseSettings,
  UpdateRemoteSyncSettingsRequest,
} from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { SettingsPage } from "./SettingsPage";

const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

const REPOSITORY_URL = "https://github.com/acme/metabase.git";
const UNREACHABLE_URL = "file:///tmp/no-such-repository/.git";
const UNREACHABLE_MESSAGE = "Couldn't reach the repository";

const LIBRARY = createMockCollectionItem({
  id: 10,
  name: "Library",
  model: "collection",
  type: "library",
  is_remote_synced: true,
});

type SetupOpts = {
  isEnabled?: boolean;
};

// The app subscribes to the session properties at its root (AppComponent), so
// the settings refetch once a mutation invalidates them.
function SessionPropertiesSubscription() {
  useGetSettingsQuery();
  return null;
}

function setup({ isEnabled = false }: SetupOpts = {}) {
  let serverSettings: EnterpriseSettings = createMockSettings({
    "remote-sync-enabled": isEnabled,
    "remote-sync-url": isEnabled ? REPOSITORY_URL : null,
    "remote-sync-type": "read-write",
    "remote-sync-branch": isEnabled ? "main" : null,
  });

  fetchMock.get("path:/api/session/properties", () => serverSettings, {
    name: "get-session-properties",
  });
  setupSettingsEndpoints(
    (
      [
        "remote-sync-url",
        "remote-sync-token",
        "remote-sync-type",
        "remote-sync-branch",
        "remote-sync-auto-import",
      ] as const
    ).map((key) =>
      createMockSettingDefinition({ key, value: serverSettings[key] }),
    ),
  );
  setupCollectionItemsEndpoint({
    collection: { id: "root" },
    collectionItems: [LIBRARY],
  });
  setupRemoteSyncEndpoints();
  fetchMock.removeRoute("remote-sync-settings");
  fetchMock.put(
    "path:/api/ee/remote-sync/settings",
    async (call) => {
      const body: UpdateRemoteSyncSettingsRequest = await call.request
        ?.clone()
        .json();
      const url = body["remote-sync-url"];
      if (url === UNREACHABLE_URL) {
        return { status: 400, body: UNREACHABLE_MESSAGE };
      }
      serverSettings = {
        ...serverSettings,
        "remote-sync-enabled": url != null && url !== "",
        "remote-sync-url": url ?? null,
        "remote-sync-type": body["remote-sync-type"] ?? null,
        "remote-sync-branch": url != null ? "main" : null,
      };
      return { success: true };
    },
    { name: "remote-sync-settings" },
  );

  renderWithProviders(
    <>
      <SessionPropertiesSubscription />
      <SettingsPage />
    </>,
    {
      withRouter: true,
      withUndos: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(serverSettings),
      }),
    },
  );
}

async function getSettingsRequestBody() {
  await waitFor(() =>
    expect(
      fetchMock.callHistory.calls("path:/api/ee/remote-sync/settings"),
    ).toHaveLength(1),
  );
  const [call] = fetchMock.callHistory.calls(
    "path:/api/ee/remote-sync/settings",
  );
  return call?.request?.json();
}

describe("SettingsPage", () => {
  afterEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("sets up read-write sync and offers to turn it off once saved", async () => {
    setup();

    await userEvent.type(
      await screen.findByLabelText("Repository URL"),
      REPOSITORY_URL,
    );
    await userEvent.click(screen.getByLabelText("Read-only"));
    await userEvent.click(screen.getByLabelText("Read-write"));
    expect(
      screen.queryByRole("button", { name: "Turn off remote sync" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Set up remote sync" }),
    );

    expect(
      await screen.findByText("Remote sync settings saved"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Turn off remote sync" }),
    ).toBeInTheDocument();
    expect(await getSettingsRequestBody()).toMatchObject({
      "remote-sync-url": REPOSITORY_URL,
      "remote-sync-type": "read-write",
    });
  });

  it("disables setup until a repository URL is given (metabase#65653)", async () => {
    setup();

    const setUpButton = await screen.findByRole("button", {
      name: "Set up remote sync",
    });
    expect(setUpButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Branch"), "develop");
    expect(setUpButton).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("Repository URL"),
      REPOSITORY_URL,
    );
    expect(setUpButton).toBeEnabled();
  });

  it("shows the error when the repository can't be reached", async () => {
    setup();

    await userEvent.type(
      await screen.findByLabelText("Repository URL"),
      UNREACHABLE_URL,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Set up remote sync" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      UNREACHABLE_MESSAGE,
    );
    expect(await getSettingsRequestBody()).toMatchObject({
      "remote-sync-url": UNREACHABLE_URL,
    });
    expect(
      screen.queryByText("Remote sync settings saved"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn off remote sync" }),
    ).not.toBeInTheDocument();
  });

  it("turns remote sync off and offers to set it up again", async () => {
    setup({ isEnabled: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Turn off remote sync" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Turn off",
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Set up remote sync" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn off remote sync" }),
    ).not.toBeInTheDocument();
    expect(await getSettingsRequestBody()).toEqual({
      "remote-sync-url": null,
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "remote_sync_deactivated",
      triggered_from: "admin-settings",
    });
  });
});
