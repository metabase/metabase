import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { getTestStoreAndWrapper } from "__support__/ui";
import { DataSectionLayout } from "metabase/data-studio/app/pages/DataSectionLayout";
import { DataStudioLayout } from "metabase/data-studio/app/pages/DataStudioLayout";
import {
  CUSTOMERS_SNAPSHOT_ID,
  DIM_CUSTOMER_ID,
  EMPTY_TABLE_STRUCTURE,
  WAREHOUSE_FIELD_VALUES,
  WORKER_POSITION_HISTORY_ID,
  createWarehouse,
  getHistoryDataset,
} from "metabase/data-studio/data-model/pages/DataModel/HistoryTablesPrototype/fixtures";
import {
  catchUnmatchedRequests,
  seedPrototypeStorage,
  setupMockApi,
} from "metabase/data-studio/data-model/pages/DataModel/HistoryTablesPrototype/mock-api.setup.spec";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Database, TableId } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { initializePlugin } from "..";
import { getDataStudioLibraryRoutes } from "../routes";

registerVisualizations();

export default {
  title: "Prototypes/Published data",
  parameters: { layout: "fullscreen", loki: { skip: true } },
};

const DATA_COLLECTION_ID = 2;
const BUSINESS_TITLE_FIELD_ID = 8605;

const DATA_COLLECTION = createMockCollection({
  id: DATA_COLLECTION_ID,
  name: "Data",
  type: "library-data",
  can_write: true,
});

const LIBRARY_COLLECTION = createMockCollection({
  id: 6464,
  name: "Library",
  type: "library",
  children: [DATA_COLLECTION],
});

function createPublishedWarehouse(): Database {
  const warehouse = createWarehouse();
  return {
    ...warehouse,
    tables: warehouse.tables?.map((table) => ({
      ...table,
      is_published: true,
      collection_id: DATA_COLLECTION_ID,
      can_write: true,
    })),
  };
}

function setupPublishedDataApi() {
  const warehouse = createPublishedWarehouse();
  setupMockApi({
    database: warehouse,
    fieldValues: WAREHOUSE_FIELD_VALUES,
    getDataset: getHistoryDataset,
    hasLibrary: true,
  });
  const publishedTables = warehouse.tables ?? [];
  setupCollectionsEndpoints({
    collections: [LIBRARY_COLLECTION, DATA_COLLECTION],
  });
  setupCollectionItemsEndpoint({
    collection: LIBRARY_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: DATA_COLLECTION_ID,
        name: DATA_COLLECTION.name,
        model: "collection",
        type: "library-data",
        here: ["table"],
      }),
    ],
  });
  fetchMock.get(`path:/api/collection/${DATA_COLLECTION_ID}`, DATA_COLLECTION);
  fetchMock.get("path:/api/table", publishedTables);
  fetchMock.get("express:/api/ee/data-studio/table/:tableId/publishing-info", {
    status: 204,
  });
  setupCollectionItemsEndpoint({
    collection: DATA_COLLECTION,
    collectionItems: publishedTables.map((table) =>
      createMockCollectionItem({
        id: Number(table.id),
        name: table.display_name,
        model: "table",
        database_id: warehouse.id,
        collection_id: DATA_COLLECTION_ID,
        can_write: true,
      }),
    ),
  });
  catchUnmatchedRequests();
}

function PublishedDataPage({ initialRoute }: { initialRoute: string }) {
  const [{ wrapper: Wrapper }] = useState(() => {
    setupPublishedDataApi();
    const settings = mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    });
    initializePlugin();
    return getTestStoreAndWrapper({
      withRouter: true,
      withKBar: false,
      withDND: false,
      initialRoute,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings,
      },
    });
  });

  return (
    <div style={{ height: "100vh" }}>
      <Wrapper>
        <Route path="data-studio" element={<DataStudioLayout />}>
          <Route path="data">
            <Route element={<DataSectionLayout />}>
              {getDataStudioMetadataRoutes(Outlet)}
            </Route>
          </Route>
          {getDataStudioLibraryRoutes(Outlet)}
        </Route>
      </Wrapper>
    </div>
  );
}

const seedStorage = () =>
  seedPrototypeStorage({
    tableStructure: EMPTY_TABLE_STRUCTURE,
    historyReview: {},
  });

const tableStory = (route: (tableId: TableId) => string, tableId: TableId) => ({
  beforeEach: seedStorage,
  render: () => <PublishedDataPage initialRoute={route(tableId)} />,
});

export const PublishedTables = {
  beforeEach: seedStorage,
  render: () => (
    <PublishedDataPage initialRoute={Urls.dataStudioPublishedData()} />
  ),
};

export const HistoryTableOverview = tableStory(
  Urls.dataStudioTable,
  WORKER_POSITION_HISTORY_ID,
);

export const HistoryTab = tableStory(
  Urls.dataStudioTableHistory,
  WORKER_POSITION_HISTORY_ID,
);

export const DbtSnapshotHistoryTab = tableStory(
  Urls.dataStudioTableHistory,
  CUSTOMERS_SNAPSHOT_ID,
);

export const DimensionHistoryTab = tableStory(
  Urls.dataStudioTableHistory,
  DIM_CUSTOMER_ID,
);

export const FieldsTab = tableStory(
  (tableId) => Urls.dataStudioTableFields(tableId),
  WORKER_POSITION_HISTORY_ID,
);

export const FieldDetails = tableStory(
  (tableId) => Urls.dataStudioTableFields(tableId, BUSINESS_TITLE_FIELD_ID),
  WORKER_POSITION_HISTORY_ID,
);
