import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupActionsEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type {
  Database,
  EnterpriseSettings,
  WritebackAction,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockQueryAction,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ActionListPage } from "./ActionListPage";

type SetupOpts = {
  databases?: Database[];
  actions?: WritebackAction[];
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

const ACTIONS_DATABASE = createMockDatabase({
  native_permissions: "write",
  settings: { "database-enable-actions": true },
});

function setup({
  databases = [ACTIONS_DATABASE],
  actions = [],
  isAdmin = true,
  remoteSyncType,
}: SetupOpts) {
  setupDatabasesEndpoints(databases);
  setupActionsEndpoints(actions);
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({
        id: "root",
        name: "Root",
        namespace: "data-actions",
      }),
    ],
  });

  const state = createMockState({
    settings: mockSettings({
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": remoteSyncType != null,
      "token-features": createMockTokenFeatures({
        remote_sync: remoteSyncType != null,
      }),
    }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });
  if (remoteSyncType != null) {
    setupEnterpriseOnlyPlugin("remote_sync");
  }

  renderWithProviders(<Route path="/" element={<ActionListPage />} />, {
    withRouter: true,
    storeInitialState: state,
  });
}

describe("ActionListPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists actions without a model at the top level, without a root row", async () => {
    setup({
      actions: [
        createMockQueryAction({
          id: 1,
          name: "Refund order",
          collection_id: null,
        }),
      ],
    });

    expect(await screen.findByText("Refund order")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("library-page")).queryByText("Data actions"),
    ).not.toBeInTheDocument();
  });

  it("offers new actions and collections with native write on an actions-enabled database", async () => {
    setup({});

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Table", "SQL query", "Collection"]);
  });

  it("opens a table picker to create an action from a table", async () => {
    setup({});
    const collection = createMockCollection({ id: 1 });
    setupCollectionByIdEndpoint({ collections: [collection] });
    setupCollectionItemsEndpoint({ collection, collectionItems: [] });

    await userEvent.click(await screen.findByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Table/ }));

    expect(
      await screen.findByText("Pick a table for the action"),
    ).toBeInTheDocument();
  });

  it("does not offer non-admins to create anything", async () => {
    setup({ isAdmin: false });

    expect(
      await screen.findByText("Queries that change data"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer to create anything without an actions-enabled database, but still links to the archive", async () => {
    setup({
      databases: [
        createMockDatabase({
          native_permissions: "write",
          settings: { "database-enable-actions": false },
        }),
      ],
    });

    expect(
      await screen.findByText("Queries that change data"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New action" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Data action options" }),
    );
    expect(
      screen.getByRole("menuitem", { name: /View archived actions/ }),
    ).toBeInTheDocument();
  });

  it.each([undefined, "read-only"] as const)(
    "opens the permissions of the data actions root from the page menu with remote sync %s",
    async (remoteSyncType) => {
      setupGroupsEndpoint([]);
      setupCollectionPermissionsGraphEndpoint({ revision: 1, groups: {} });
      setup({ remoteSyncType });

      await userEvent.click(
        await screen.findByRole("button", { name: "Data action options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Change permissions/ }),
      );

      expect(
        await within(screen.getByRole("dialog")).findByRole("heading", {
          name: "Permissions for Root",
        }),
      ).toBeInTheDocument();
    },
  );

  it("does not offer non-admins to change the permissions of data actions", async () => {
    setup({ isAdmin: false });

    await userEvent.click(
      await screen.findByRole("button", { name: "Data action options" }),
    );

    expect(
      screen.getByRole("menuitem", { name: /View archived actions/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Change permissions/ }),
    ).not.toBeInTheDocument();
  });
});
