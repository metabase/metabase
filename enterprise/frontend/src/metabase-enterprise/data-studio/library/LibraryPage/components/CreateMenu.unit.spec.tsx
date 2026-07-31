import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { EnterpriseSettings } from "metabase-types/api";
import {
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
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  worktreeId?: number;
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
  remoteSyncType,
  worktreeId,
}: SetupOptions = {}) => {
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
      worktreeId={worktreeId}
    />,
    {
      storeInitialState: state,
    },
  );

  return utils;
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
        showCollectionPicker: true,
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

  it("renders nothing if remote sync is set to read-only", () => {
    setup({ user: fullPermissionsUser, remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("button", { name: /New/ }),
    ).not.toBeInTheDocument();
  });

  it("still renders in a worktree when remote sync is read-only, minus the published-table option", async () => {
    setup({
      user: fullPermissionsUser,
      remoteSyncType: "read-only",
      worktreeId: 7,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Metric", "Snippet", "Collection"]);
  });

  it("opens the collection modal without a location picker in a worktree", async () => {
    const { store } = setup({
      user: fullPermissionsUser,
      dataCollectionId: 42,
      worktreeId: 7,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal.props).toMatchObject({
      initialCollectionId: 42,
      showCollectionPicker: false,
    });
  });

  it("links the snippet option to the worktree's new-snippet page", async () => {
    setup({ user: fullPermissionsUser, worktreeId: 7 });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getByRole("menuitem", { name: /Create new snippet/ }),
    ).toHaveAttribute("href", "/data-studio/library/snippets/new?worktreeId=7");
  });
});
