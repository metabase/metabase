import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupLibraryEndpoints,
  setupRootCollectionItemsEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { CollectionPickerModalProps } from "metabase/common/components/Pickers/CollectionPicker/CollectionPickerModal";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  CollectionItem,
  EnterpriseSettings,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { TableMoreMenu, type TableMoreMenuProps } from "./TableMoreMenu";

// Mocking picker modal to limit overhead (picker functionality is tested in e2e tests)
jest.mock("metabase/common/components/Pickers", () => ({
  CollectionPickerModal: ({ onChange }: CollectionPickerModalProps) => (
    <button
      onClick={() =>
        onChange({
          id: 11,
          name: "Destination",
          model: "collection",
          can_write: true,
        })
      }
    >
      Destination
    </button>
  ),
}));

type SetupOpts = {
  table?: TableMoreMenuProps["table"];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  onMoved?: TableMoreMenuProps["onMoved"];
};

const dataCollection = createMockCollection({
  id: 10,
  name: "Data",
  type: "library-data",
  can_write: true,
  location: "/6464/",
});

const destinationCollection = createMockCollection({
  id: 11,
  name: "Destination",
  type: "library-data",
  can_write: true,
  location: "/6464/10/",
});

const setup = ({ table, remoteSyncType, onMoved }: SetupOpts = {}) => {
  const tableData =
    table ??
    createMockTable({
      id: 1,
      db_id: 1,
      schema: "PUBLIC",
      collection_id: dataCollection.id as number,
    });

  const tokenFeatures: Partial<TokenFeatures> = {
    library: true,
    remote_sync: !!remoteSyncType,
  };
  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    settings,
  });

  const enterprisePlugins: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  setupEnterpriseOnlyPlugin("library");
  setupLibraryEndpoints(true);
  setupCollectionsEndpoints({
    collections: [],
    rootCollection: createMockCollection({
      id: "root",
      name: "Our analytics",
      can_write: true,
    }),
  });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionItemsEndpoint({
    collection: { id: 1 },
    collectionItems: [],
  });
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ id: 1, name: "Personal Collection" }),
      dataCollection,
      destinationCollection,
    ],
  });
  setupCollectionItemsEndpoint({
    collection: { id: 6464 },
    collectionItems: [
      createMockCollectionItem({
        id: dataCollection.id as number,
        name: dataCollection.name,
        model: "collection",
        type: dataCollection.type,
        can_write: dataCollection.can_write,
        collection_id: 6464,
        location: "/6464/",
        here: ["collection"],
        below: ["collection"],
        is_library_root: true,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: dataCollection,
    collectionItems: [
      createMockCollectionItem({
        id: destinationCollection.id as number,
        name: destinationCollection.name,
        model: "collection",
        type: destinationCollection.type,
        can_write: destinationCollection.can_write,
        collection_id: dataCollection.id as number,
        location: "/6464/10/",
        here: ["table"],
        below: [],
      }),
    ],
  });
  setupTableEndpoints(createMockTable({ id: tableData.id }));

  renderWithProviders(
    <Route
      path="/"
      component={() => <TableMoreMenu table={tableData} onMoved={onMoved} />}
    />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );
};

describe("TableMoreMenu", () => {
  it("renders the View and the Unpublish menu options", async () => {
    setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Show table options" }),
    );
    expect(screen.getByRole("menuitem", { name: /View/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Unpublish/ }),
    ).toBeInTheDocument();
  });

  it("does not render the Unpublish option when remote sync is set to read-only", async () => {
    setup({ remoteSyncType: "read-only" });
    await userEvent.click(
      screen.getByRole("button", { name: "Show table options" }),
    );
    expect(screen.getByRole("menuitem", { name: /View/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Unpublish/ }),
    ).not.toBeInTheDocument();
  });

  describe("with CollectionItem", () => {
    it("renders View, Move, and Unpublish menu options", async () => {
      const collectionItem = createMockCollectionItem({
        id: 42,
        model: "table",
        name: "Orders",
        database_id: 1,
        collection_id: 10,
      }) as CollectionItem;

      setup({ table: collectionItem });
      await userEvent.click(
        screen.getByRole("button", { name: "Show table options" }),
      );
      expect(
        screen.getByRole("menuitem", { name: /View/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Move/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Unpublish/ }),
      ).toBeInTheDocument();
    });

    it("renders menu without View when database_id is missing", async () => {
      const collectionItem = createMockCollectionItem({
        id: 42,
        model: "table",
        name: "Orders",
        database_id: undefined,
        collection_id: 10,
      }) as CollectionItem;

      setup({ table: collectionItem });
      await userEvent.click(
        screen.getByRole("button", { name: "Show table options" }),
      );
      expect(
        screen.queryByRole("menuitem", { name: /View/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Move/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Unpublish/ }),
      ).toBeInTheDocument();
    });
  });

  it("moves a table to another Library Data collection", async () => {
    const onMoved = jest.fn();
    const table = createMockCollectionItem({
      id: 42,
      model: "table",
      name: "Orders",
      database_id: 1,
      collection_id: dataCollection.id as number,
    }) as CollectionItem;

    setup({ table, onMoved });
    await userEvent.click(
      screen.getByRole("button", { name: "Show table options" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: /Move/ }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Destination" }),
    );

    await waitFor(() => expect(onMoved).toHaveBeenCalledWith([11, 10]));
    const request = fetchMock.callHistory.lastCall("table-42-put")?.request;
    expect(await request?.json()).toEqual({ collection_id: 11 });
    expect(screen.queryByTestId("entity-picker-modal")).not.toBeInTheDocument();
  });
});
