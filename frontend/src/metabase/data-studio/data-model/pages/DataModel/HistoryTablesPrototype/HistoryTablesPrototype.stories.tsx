import { useState } from "react";

import { mockSettings } from "__support__/settings";
import { VisualizationWrapper } from "__support__/storybook";
import { getTestStoreAndWrapper } from "__support__/ui";
import { DataSectionLayout } from "metabase/data-studio/app/pages/DataSectionLayout";
import { DataStudioLayout } from "metabase/data-studio/app/pages/DataStudioLayout";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { PrototypeFrame } from "./PrototypeFrame";
import { VersionAwareJoin } from "./VersionAwareJoin";
import {
  ACCOUNT_HISTORY_ID,
  CUSTOMERS_SNAPSHOT_ID,
  DIM_CUSTOMER_ID,
  DIM_CUSTOMER_ID_FIELD_ID,
  EMPTY_TABLE_STRUCTURE,
  WAREHOUSE_FIELD_VALUES,
  WAREHOUSE_ID,
  createWarehouse,
  getHistoryDataset,
} from "./fixtures";
import {
  catchUnmatchedRequests,
  seedPrototypeStorage,
  setupMockApi,
} from "./mock-api.setup.spec";

export default {
  title: "Prototypes/History tables",
  parameters: { layout: "fullscreen", loki: { skip: true } },
};

const SCHEMA_NAME = "analytics";

const DIM_CUSTOMER_FIXED_STRUCTURE = {
  tables: {
    [`${WAREHOUSE_ID}:${DIM_CUSTOMER_ID}`]: {
      history: {
        durableKeyFieldId: DIM_CUSTOMER_ID_FIELD_ID,
      },
    },
  },
  grainByField: {},
};

const seedStorage =
  (tableStructure: Record<string, unknown> = EMPTY_TABLE_STRUCTURE) =>
  () =>
    seedPrototypeStorage({ tableStructure, historyReview: {} });

function DataStudioPage({ initialRoute }: { initialRoute: string }) {
  const [{ wrapper: Wrapper }] = useState(() => {
    setupMockApi({
      database: createWarehouse(),
      fieldValues: WAREHOUSE_FIELD_VALUES,
      getDataset: getHistoryDataset,
    });
    catchUnmatchedRequests();
    return getTestStoreAndWrapper({
      withRouter: true,
      withKBar: false,
      withDND: false,
      initialRoute,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures(),
        }),
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
        </Route>
      </Wrapper>
    </div>
  );
}

const tableRoute = (
  tableId: number,
  tab: DataStudioTableMetadataTab,
  fieldId?: number,
) =>
  Urls.dataStudioData({
    databaseId: WAREHOUSE_ID,
    schemaName: SCHEMA_NAME,
    tableId,
    tab,
    fieldId,
  });

export const TableList = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={Urls.dataStudioData({
        databaseId: WAREHOUSE_ID,
        schemaName: SCHEMA_NAME,
      })}
    />
  ),
};

export const DimCustomerAsInferred = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_CUSTOMER_ID, "details")} />
  ),
};

export const DimCustomerVersions = {
  beforeEach: seedStorage(DIM_CUSTOMER_FIXED_STRUCTURE),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_CUSTOMER_ID, "versions")} />
  ),
};

export const DbtSnapshotVersions = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(CUSTOMERS_SNAPSHOT_ID, "versions")}
    />
  ),
};

export const FivetranHistoryDetails = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(ACCOUNT_HISTORY_ID, "details")} />
  ),
};

export const FieldHistoryRole = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_CUSTOMER_ID, "field", 8110)} />
  ),
};

export const WhatThisUnlocks = {
  render: () => (
    <VisualizationWrapper>
      <PrototypeFrame
        step="Unlocks"
        title="With the binding filled in, a join can pick the right version"
        description="Fct Orders joined to Dim Customer matches each order to the customer version valid on its order date, using the durable key and the valid from and valid to columns set in Data Studio. Without them, every order matches every version and revenue is counted more than once."
        height={640}
      >
        <VersionAwareJoin isHistoryAware />
      </PrototypeFrame>
    </VisualizationWrapper>
  ),
};
