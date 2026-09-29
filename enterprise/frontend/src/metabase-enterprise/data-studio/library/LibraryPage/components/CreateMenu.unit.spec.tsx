import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { User } from "metabase-types/api/user";

import { CreateMenu } from "./CreateMenu";

interface SetupOptions {
  user?: Partial<User>;
  libraryCollectionId?: number;
  canWriteToLibrary?: boolean;
  dataCollectionId?: number;
  canWriteToDataCollection?: boolean;
  canWriteToMetricCollection?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
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
  libraryCollectionId = 7,
  canWriteToLibrary = true,
  dataCollectionId = 2,
  canWriteToDataCollection = true,
  canWriteToMetricCollection = true,
  remoteSyncType,
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
      libraryCollectionId={libraryCollectionId}
      canWriteToLibrary={canWriteToLibrary}
      metricCollectionId={1}
      dataCollectionId={dataCollectionId}
      canWriteToDataCollection={canWriteToDataCollection}
      canWriteToMetricCollection={canWriteToMetricCollection}
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
    ).toEqual(["Published table", "Metric", "Snippet", "Folder"]);
  });

  it("renders publish and folder options for data analysts", async () => {
    setup({ user: { is_data_analyst: true } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Folder"]);
  });

  it("renders publish and metric options if user only has query builder access", async () => {
    setup({ user: { permissions: { can_create_queries: true } } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Folder"]);
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
    ).toEqual(["Published table", "Snippet", "Folder"]);
  });

  it("renders Folder option when only Data collection is writable", async () => {
    setup({
      user: { is_data_analyst: true },
      canWriteToDataCollection: true,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Folder"]);
  });

  it("does not render Folder option without writable Library collections or native write", async () => {
    setup({
      user: {},
      canWriteToLibrary: false,
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table"]);
  });

  it("defaults a new folder to the top level of the Library", async () => {
    const { store } = setup({
      user: fullPermissionsUser,
      libraryCollectionId: 7,
      dataCollectionId: 42,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Folder/ }));

    expect(store.getState().modal).toEqual({
      id: "collection",
      props: {
        title: "New folder",
        initialCollectionId: 7,
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
        showIconPicker: true,
      },
    });
  });

  it("falls back to the Data collection when the Library root is not writable", async () => {
    const { store } = setup({
      user: fullPermissionsUser,
      canWriteToLibrary: false,
      dataCollectionId: 42,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Folder/ }));

    expect(store.getState().modal.props).toMatchObject({
      initialCollectionId: 42,
    });
  });

  it("opens the collection modal scoped to snippets when only native write is available", async () => {
    const { store } = setup({
      user: { permissions: { can_create_native_queries: true } },
      canWriteToLibrary: false,
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Folder/ }));

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
});
