import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupLibraryEndpoints,
  setupPublishTablesEndpoint,
  setupPublishTablesEndpointError,
  setupTableSelectionInfoEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  BulkTableSelectionInfo,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";
import {
  createMockBulkTableInfo,
  createMockBulkTableSelectionInfo,
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublishTablesModal } from "./PublishTablesModal";

type SetupOpts = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  selectionInfo?: BulkTableSelectionInfo;
  hasPublishError?: boolean;
};

function setup({
  databaseIds,
  schemaIds,
  tableIds,
  selectionInfo = createMockBulkTableSelectionInfo(),
  hasPublishError,
}: SetupOpts = {}) {
  const onPublish = jest.fn();
  const onClose = jest.fn();
  const dataCollection = createMockCollection({
    id: 10,
    name: "Data",
    type: "library-data",
  });
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
  });

  setupEnterpriseOnlyPlugin("library");
  setupLibraryEndpoints(true);
  setupCollectionItemsEndpoint({
    collection: { id: 6464 },
    collectionItems: [
      createMockCollectionItem({
        id: dataCollection.id as number,
        name: dataCollection.name,
        model: "collection",
        type: dataCollection.type,
        can_write: true,
        location: "/6464/",
        here: ["table", "collection"],
        below: ["table", "collection"],
      }),
    ],
  });
  setupCollectionByIdEndpoint({ collections: [dataCollection] });

  setupTableSelectionInfoEndpoint(selectionInfo);
  if (hasPublishError) {
    setupPublishTablesEndpointError();
  } else {
    setupPublishTablesEndpoint();
  }

  renderWithProviders(
    <PublishTablesModal
      databaseIds={databaseIds}
      schemaIds={schemaIds}
      tableIds={tableIds}
      isOpened
      onPublish={onPublish}
      onClose={onClose}
    />,
    { storeInitialState: state },
  );

  return { onPublish, onClose };
}

describe("PublishTablesModal", () => {
  it("should be able to publish a single table", async () => {
    const { onPublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Orders",
        }),
      }),
    });
    expect(await screen.findByText("Publish Orders?")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Publish this table"));
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });

  it("should be able to publish a single table with remapped tables", async () => {
    const { onPublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Orders",
        }),
        unpublished_upstream_tables: [
          createMockBulkTableInfo({
            id: 2,
            display_name: "Products",
          }),
          createMockBulkTableInfo({
            id: 3,
            display_name: "People",
          }),
        ],
      }),
    });
    expect(
      await screen.findByText("Publish Orders and the tables it depends on?"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Products")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Publish these tables"));
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });

  it("should be able to publish multiple tables", async () => {
    const { onPublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: null,
      }),
    });
    expect(
      await screen.findByText("Publish these tables?"),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Publish these tables"));
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });

  it("should be able to publish multiple tables with remapped tables", async () => {
    const { onPublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: null,
        unpublished_upstream_tables: [
          createMockBulkTableInfo({
            id: 2,
            display_name: "Products",
          }),
          createMockBulkTableInfo({
            id: 3,
            display_name: "People",
          }),
        ],
      }),
    });
    expect(
      await screen.findByText(
        "Publish these tables and the tables they depend on?",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Products")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Publish these tables"));
    await waitFor(() => expect(onPublish).toHaveBeenCalled());
  });

  it("should show a publish error", async () => {
    const { onPublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Orders",
        }),
      }),
      hasPublishError: true,
    });
    expect(await screen.findByText("Publish Orders?")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Publish this table"));
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(onPublish).not.toHaveBeenCalled();
  });
});
