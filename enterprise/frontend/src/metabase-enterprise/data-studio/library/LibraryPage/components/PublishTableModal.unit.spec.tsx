import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupLibraryEndpoints,
  setupPublishTablesEndpoint,
  setupTableSelectionInfoEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { createMockState } from "metabase/redux/store/mocks";
import type { BulkTableSelectionInfo } from "metabase-types/api";
import {
  createMockBulkTableInfo,
  createMockBulkTableSelectionInfo,
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublishTableModal } from "./PublishTableModal";

jest.mock("metabase/common/components/Pickers/EntityPicker", () => ({
  ...jest.requireActual(
    "metabase/common/components/Pickers/EntityPicker/types",
  ),
  EntityPickerModal: ({
    onChange,
    onClose,
  }: {
    onChange: (item: OmniPickerItem) => void;
    onClose: () => void;
  }) => (
    <div data-testid="entity-picker-modal">
      <button
        onClick={() =>
          onChange({
            model: "table",
            id: 1,
            name: "ORDERS",
            database_id: 1,
          } as OmniPickerItem)
        }
      >
        Select Orders
      </button>
      <button onClick={onClose}>Close picker</button>
    </div>
  ),
}));

interface SetupOpts {
  opened?: boolean;
  selectionInfo?: BulkTableSelectionInfo;
}

function setup({
  opened = true,
  selectionInfo = createMockBulkTableSelectionInfo({
    selected_table: createMockBulkTableInfo({
      id: 1,
      display_name: "Orders",
    }),
  }),
}: SetupOpts = {}) {
  const onClose = jest.fn();
  const onPublished = jest.fn();
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
  setupPublishTablesEndpoint();

  renderWithProviders(
    <PublishTableModal
      opened={opened}
      onClose={onClose}
      onPublished={onPublished}
    />,
    { storeInitialState: state },
  );

  return { dataCollection, onClose, onPublished };
}

describe("PublishTableModal", () => {
  it("should show the entity picker initially", () => {
    setup();
    expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();
  });

  it("should show the publish confirmation modal after selecting a table and call onClose and onPublished on publish", async () => {
    const { dataCollection, onClose, onPublished } = setup();
    await userEvent.click(screen.getByText("Select Orders"));
    expect(await screen.findByText("Publish Orders?")).toBeInTheDocument();
    expect(await screen.findByText("Publish to")).toBeInTheDocument();
    expect(await screen.findByText("Data")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Publish this table"));
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    const request = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/table/publish-tables",
    )?.request;
    expect(await request?.json()).toEqual({
      table_ids: [1],
      collection_id: dataCollection.id,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("should show FK remapping warning when table has unpublished upstream tables", async () => {
    setup({
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
    await userEvent.click(screen.getByText("Select Orders"));
    expect(
      await screen.findByText("Publish Orders and the tables it depends on?"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Products")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
  });

  it("should return to picker when publish modal is closed", async () => {
    setup();
    await userEvent.click(screen.getByText("Select Orders"));
    expect(await screen.findByText("Publish Orders?")).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Cancel"));
    expect(screen.getByTestId("entity-picker-modal")).toBeInTheDocument();
  });

  it("should call onClose when entity picker is closed", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByText("Close picker"));
    expect(onClose).toHaveBeenCalled();
  });
});
