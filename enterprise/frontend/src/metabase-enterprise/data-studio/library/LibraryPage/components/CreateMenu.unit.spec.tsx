import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database, EnterpriseSettings } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { User } from "metabase-types/api/user";

import { CreateMenu } from "./CreateMenu";

interface SetupOptions {
  user?: Partial<User>;
  dataCollectionId?: number;
  canWriteToDataCollection?: boolean;
  canWriteToMetricCollection?: boolean;
  canWriteToDashboardCollection?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  databases?: Database[];
}

const fullPermissionsUser: Partial<User> = {
  is_superuser: true,
  permissions: {
    can_create_queries: true,
    can_create_native_queries: true,
  },
};

const setup = ({
  user,
  dataCollectionId = 2,
  canWriteToDataCollection = true,
  canWriteToMetricCollection = true,
  canWriteToDashboardCollection = false,
  remoteSyncType,
  databases = [],
}: SetupOptions = {}) => {
  setupDatabasesEndpoints(databases);
  const onNewDashboardClick = jest.fn();
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        library: true,
        snippet_collections: true,
      }),
      "remote-sync-type": remoteSyncType,
      "remote-sync-enabled": !!remoteSyncType,
    }),
    currentUser: createMockUser(user),
  });
  setupEnterprisePlugins();
  const utils = renderWithProviders(
    <CreateMenu
      metricCollectionId={1}
      dataCollectionId={dataCollectionId}
      canWriteToDataCollection={canWriteToDataCollection}
      canWriteToMetricCollection={canWriteToMetricCollection}
      dashboardCollectionId={3}
      canWriteToDashboardCollection={canWriteToDashboardCollection}
      onNewDashboardClick={onNewDashboardClick}
    />,
    {
      storeInitialState: state,
    },
  );

  return { ...utils, onNewDashboardClick };
};

describe("CreateMenu", () => {
  it("renders all options for admins", async () => {
    setup({ user: fullPermissionsUser });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Snippet", "Collection"]);
  });

  it("renders publish and collection options for data analysts", async () => {
    setup({ user: { is_data_analyst: true } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Collection"]);
  });

  it("renders publish and metric options if user only has query builder access", async () => {
    setup({ user: { permissions: { can_create_queries: true } } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Collection"]);
  });

  it("does not render Metric option when canWriteToMetricCollection is false", async () => {
    setup({
      user: {
        is_superuser: true,
        permissions: {
          can_create_queries: true,
          can_create_native_queries: true,
        },
      },
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Snippet", "Collection"]);
  });

  it("renders Collection option when only Data collection is writable", async () => {
    setup({
      user: { is_data_analyst: true },
      canWriteToDataCollection: true,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Collection"]);
  });

  it("does not render Collection option without writable Library collections or native write", async () => {
    setup({
      user: {},
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table"]);
  });

  it("opens the collection modal with Library and snippets picker options", async () => {
    const { store } = setup({
      user: fullPermissionsUser,
      dataCollectionId: 42,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal).toEqual({
      id: "collection",
      props: {
        inDataStudio: true,
        initialCollectionId: 42,
        namespaces: [null, "snippets"],
        pickerOptions: {
          hasLibrary: true,
          hasRootCollection: false,
          hasPersonalCollections: false,
          hasRecents: false,
          hasSearch: false,
          hasConfirmButtons: true,
          canCreateCollections: false,
        },
        showAuthorityLevelPicker: false,
      },
    });
  });

  it("opens the collection modal scoped to snippets when only native write is available", async () => {
    const { store } = setup({
      user: { permissions: { can_create_native_queries: true } },
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal.props).toMatchObject({
      initialCollectionId: null,
      namespaces: ["snippets"],
    });
  });

  it("renders the Dashboard option when the Dashboards collection is writable", async () => {
    const { onNewDashboardClick } = setup({
      user: fullPermissionsUser,
      canWriteToDashboardCollection: true,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Published table",
      "Metric",
      "Dashboard",
      "Snippet",
      "Collection",
    ]);

    await userEvent.click(screen.getByRole("menuitem", { name: /Dashboard/ }));
    expect(onNewDashboardClick).toHaveBeenCalled();
  });

  it("renders the Collection option when only the Dashboards collection is writable", async () => {
    const { store } = setup({
      user: {},
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
      canWriteToDashboardCollection: true,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal.props).toMatchObject({
      initialCollectionId: 3,
      namespaces: [null],
    });
  });

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ user: fullPermissionsUser, remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the action option with native write on an actions-enabled database", async () => {
    setup({
      user: fullPermissionsUser,
      databases: [
        createMockDatabase({
          native_permissions: "write",
          settings: { "database-enable-actions": true },
        }),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      await screen.findByRole("menuitem", { name: /Action/ }),
    ).toBeInTheDocument();
  });

  it("does not render the action option without an actions-enabled database", async () => {
    setup({
      user: fullPermissionsUser,
      databases: [
        createMockDatabase({
          native_permissions: "write",
          settings: { "database-enable-actions": false },
        }),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(await screen.findByText("Snippet")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Action/ }),
    ).not.toBeInTheDocument();
  });
});
