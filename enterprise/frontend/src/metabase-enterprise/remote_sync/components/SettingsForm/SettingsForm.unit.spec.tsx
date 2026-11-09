import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupRemoteSyncSettingsEndpoint,
  setupRemoteSyncSettingsEndpointError,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  CollectionItem,
  RemoteSyncTaskId,
  RemoteSyncType,
  RemoteSyncUnsyncedDependenciesErrorData,
} from "metabase-types/api";
import {
  createMockCollectionItem,
  createMockRemoteSyncEntityCollection,
  createMockRemoteSyncEntityCollectionAncestor,
  createMockRemoteSyncEntityRef,
  createMockRemoteSyncUnsyncedDependenciesErrorData,
  createMockRemoteSyncUnsyncedDependency,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { SettingsForm } from "./SettingsForm";

const LIBRARY = createMockCollectionItem({
  id: 10,
  name: "Library",
  model: "collection",
  type: "library",
});
const MARKETING = createMockCollectionItem({
  id: 20,
  name: "Marketing",
  model: "collection",
});
const SALES = createMockCollectionItem({
  id: 30,
  name: "Sales",
  model: "collection",
});
const UNSYNCED_DEPENDENCIES_ERROR =
  createMockRemoteSyncUnsyncedDependenciesErrorData({
    unsynced_dependencies: [
      createMockRemoteSyncUnsyncedDependency({
        name: "Revenue",
        collection: createMockRemoteSyncEntityCollection({
          id: 31,
          name: "Reports",
          effective_ancestors: [
            createMockRemoteSyncEntityCollectionAncestor({
              id: SALES.id,
              name: SALES.name,
            }),
          ],
        }),
        used_by: [createMockRemoteSyncEntityRef({ name: "Overview" })],
      }),
    ],
  });

type SetupOpts = {
  isEnabled?: boolean;
  url?: string;
  syncType?: RemoteSyncType;
  collections?: CollectionItem[];
  settingsTaskId?: RemoteSyncTaskId;
  settingsError?: RemoteSyncUnsyncedDependenciesErrorData;
};

const setup = ({
  isEnabled = false,
  url = "",
  syncType = "read-write",
  collections = [LIBRARY, MARKETING],
  settingsTaskId,
  settingsError,
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "remote-sync-enabled": isEnabled,
    "remote-sync-url": url,
    "remote-sync-type": syncType,
    "remote-sync-branch": isEnabled ? "main" : null,
  });
  const onSaved = jest.fn<void, []>();

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(
    (
      [
        "remote-sync-url",
        "remote-sync-token",
        "remote-sync-type",
        "remote-sync-branch",
        "remote-sync-auto-import",
      ] as const
    ).map((key) => createMockSettingDefinition({ key, value: settings[key] })),
  );
  setupCollectionItemsEndpoint({
    collection: { id: "root" },
    collectionItems: collections,
  });
  setupRemoteSyncEndpoints({ settingsTaskId });
  if (settingsError != null) {
    setupRemoteSyncSettingsEndpointError(settingsError);
  }

  renderWithProviders(
    <SettingsForm triggeredFrom="admin-settings" onSaved={onSaved} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
    },
  );

  return { onSaved };
};

const getSettingsRequestBodies = () =>
  Promise.all(
    fetchMock.callHistory
      .calls("path:/api/ee/remote-sync/settings")
      .map((call) => call.request?.json()),
  );

const getSettingsRequestBody = async () => {
  const [body] = await getSettingsRequestBodies();
  return body;
};

describe("SettingsForm", () => {
  it("sets up remote sync of Library and chosen collections", async () => {
    const { onSaved } = setup();

    await userEvent.type(
      await screen.findByLabelText("Repository URL"),
      "https://github.com/acme/metabase.git",
    );
    await userEvent.click(screen.getByRole("switch", { name: "Marketing" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Set up remote sync" }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(await getSettingsRequestBody()).toEqual({
      "remote-sync-url": "https://github.com/acme/metabase.git",
      "remote-sync-type": "read-write",
      "remote-sync-branch": null,
      "remote-sync-auto-import": false,
      collections: { [LIBRARY.id]: true, [MARKETING.id]: true },
    });
  });

  it("pulls read-only instances once saved and shows pull progress", async () => {
    const { onSaved } = setup({ settingsTaskId: 1 });

    await userEvent.type(
      await screen.findByLabelText("Repository URL"),
      "https://github.com/acme/metabase.git",
    );
    await userEvent.click(screen.getByLabelText("Read-only"));

    expect(
      screen.queryByRole("switch", { name: "Marketing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Pull changes automatically" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Set up remote sync" }),
    );

    expect(await screen.findByText("Pulling changes")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await getSettingsRequestBody()).toMatchObject({
      "remote-sync-type": "read-only",
      collections: null,
    });
  });

  it("tests repository connection", async () => {
    setup();

    await userEvent.type(
      await screen.findByLabelText("Repository URL"),
      "https://github.com/acme/metabase.git",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Test connection" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/remote-sync/test-connection",
        ),
      ).toBe(true),
    );
    const [call] = fetchMock.callHistory.calls(
      "path:/api/ee/remote-sync/test-connection",
    );
    expect(await call?.request?.json()).toEqual({
      "remote-sync-url": "https://github.com/acme/metabase.git",
    });
  });

  it("offers to sync the collections synced content depends on", async () => {
    const { onSaved } = setup({
      isEnabled: true,
      url: "https://github.com/acme/metabase.git",
      collections: [LIBRARY, MARKETING, SALES],
      settingsError: UNSYNCED_DEPENDENCIES_ERROR,
    });

    await userEvent.click(
      await screen.findByRole("switch", { name: "Marketing" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Sales")).toBeInTheDocument();
    expect(within(modal).getByText("Revenue")).toBeInTheDocument();
    expect(within(modal).getByText("Used by Overview")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    setupRemoteSyncSettingsEndpoint();
    await userEvent.click(
      within(modal).getByRole("switch", { name: "Sync Sales" }),
    );
    await userEvent.click(
      within(modal).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const [firstBody, secondBody] = await getSettingsRequestBodies();
    expect(firstBody).toMatchObject({ collections: { [MARKETING.id]: true } });
    expect(secondBody).toMatchObject({
      collections: { [MARKETING.id]: true, [SALES.id]: true },
    });
  });

  it("pulls changes on demand when syncing read-only", async () => {
    setup({
      isEnabled: true,
      url: "https://github.com/acme/metabase.git",
      syncType: "read-only",
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Pull now" }),
    );

    expect(await screen.findByText("Pulling changes")).toBeInTheDocument();
    const [call] = fetchMock.callHistory.calls(
      "path:/api/ee/remote-sync/import",
    );
    expect(await call?.request?.json()).toEqual({ force: true });
  });

  it("doesn't offer to pull on demand when syncing read-write", async () => {
    setup({ isEnabled: true, url: "https://github.com/acme/metabase.git" });

    expect(
      await screen.findByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pull now" }),
    ).not.toBeInTheDocument();
  });

  it("can turn remote sync off once it is set up", async () => {
    setup({ isEnabled: true, url: "https://github.com/acme/metabase.git" });

    expect(
      await screen.findByRole("button", { name: "Turn off remote sync" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});
