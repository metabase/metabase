import { type ReactElement, useState } from "react";

import { mockSettings } from "__support__/settings";
import { VisualizationWrapper } from "__support__/storybook";
import { getTestStoreAndWrapper } from "__support__/ui";
import { DataSectionLayout } from "metabase/data-studio/app/pages/DataSectionLayout";
import { DataStudioLayout } from "metabase/data-studio/app/pages/DataStudioLayout";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AgentComparisonPrototype } from "./AgentComparisonPrototype";
import { PrototypeFrame } from "./PrototypeFrame";
import { VersionAwareJoin } from "./VersionAwareJoin";
import {
  ACCOUNT_HISTORY_ID,
  CUSTOMERS_SNAPSHOT_ID,
  DIM_CUSTOMER_ID,
  DIM_PRODUCT_ID,
  EMPTY_TABLE_STRUCTURE,
  SUBSCRIPTION_HISTORY_ID,
  WAREHOUSE_FIELD_VALUES,
  WAREHOUSE_ID,
  WORKER_POSITION_HISTORY_ID,
  createWarehouse,
  getHistoryDataset,
} from "./fixtures";
import {
  catchUnmatchedRequests,
  seedPrototypeStorage,
  setupMockApi,
} from "./mock-api.setup.spec";

registerVisualizations();

export default {
  title: "Prototypes/History tables",
  parameters: { layout: "fullscreen", loki: { skip: true } },
};

const seedStorage =
  (tableStructure: Record<string, unknown> = EMPTY_TABLE_STRUCTURE) =>
  () =>
    seedPrototypeStorage({ tableStructure, historyReview: {} });

function AgentPage({ children }: { children: ReactElement }) {
  const [{ wrapper: Wrapper }] = useState(() =>
    getTestStoreAndWrapper({
      withRouter: false,
      withKBar: false,
      withDND: false,
      initialRoute: "/",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    }),
  );
  return <Wrapper>{children}</Wrapper>;
}

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
  table: { id: number; schema: string },
  tab: DataStudioTableMetadataTab,
  fieldId?: number,
) =>
  Urls.dataStudioData({
    databaseId: WAREHOUSE_ID,
    schemaName: table.schema,
    tableId: table.id,
    tab,
    fieldId,
  });

const WORKER_POSITION_HISTORY = {
  id: WORKER_POSITION_HISTORY_ID,
  schema: "analytics",
};
const CUSTOMERS_SNAPSHOT = { id: CUSTOMERS_SNAPSHOT_ID, schema: "analytics" };
const ACCOUNT_HISTORY = { id: ACCOUNT_HISTORY_ID, schema: "analytics" };
const SUBSCRIPTION_HISTORY = {
  id: SUBSCRIPTION_HISTORY_ID,
  schema: "analytics",
};
const DIM_CUSTOMER = { id: DIM_CUSTOMER_ID, schema: "analytics" };
const DIM_PRODUCT = { id: DIM_PRODUCT_ID, schema: "analytics" };
const BUSINESS_TITLE_FIELD_ID = 8605;
const EFFECTIVE_DATE_FIELD_ID = 8610;

export const TableList = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={Urls.dataStudioData({
        databaseId: WAREHOUSE_ID,
        schemaName: "analytics",
      })}
    />
  ),
};

export const WorkerPositionHistoryDetails = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(WORKER_POSITION_HISTORY, "details")}
    />
  ),
};

export const DbtSnapshotDetails = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(CUSTOMERS_SNAPSHOT, "details")} />
  ),
};

export const FivetranHistoryModeDetails = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(ACCOUNT_HISTORY, "details")} />
  ),
};

export const KeyShapeDetails = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(SUBSCRIPTION_HISTORY, "details")}
    />
  ),
};

export const ScdType3PreviousValues = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_PRODUCT, "details")} />
  ),
};

export const ScdType4CurrentTable = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(SUBSCRIPTION_HISTORY, "details")}
    />
  ),
};

export const ScdType6CurrentValues = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_CUSTOMER, "details")} />
  ),
};

export const ScdType7FactKey = {
  beforeEach: seedStorage({
    tables: { [`${WAREHOUSE_ID}:${DIM_CUSTOMER_ID}`]: { scdType: 7 } },
    grainByField: {},
  }),
  render: () => (
    <DataStudioPage initialRoute={tableRoute(DIM_CUSTOMER, "details")} />
  ),
};

export const FieldCorrections = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(
        WORKER_POSITION_HISTORY,
        "field",
        BUSINESS_TITLE_FIELD_ID,
      )}
    />
  ),
};

export const FieldHistoryRole = {
  beforeEach: seedStorage(),
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(
        WORKER_POSITION_HISTORY,
        "field",
        EFFECTIVE_DATE_FIELD_ID,
      )}
    />
  ),
};

export const AgentComparison = {
  render: () => (
    <AgentPage>
      <AgentComparisonPrototype />
    </AgentPage>
  ),
};

export const LaterVersionAwareJoin = {
  render: () => (
    <VisualizationWrapper>
      <PrototypeFrame
        step="Later"
        title="Later, in the query builder: a join that picks the right version"
        description="Fct Orders joined to Dim Customer matches each order to the customer version valid on its order date, using the durable key and the valid from and valid to columns set in Data Studio. Without them, every order matches every version and revenue is counted more than once."
        height={640}
      >
        <VersionAwareJoin isHistoryAware />
      </PrototypeFrame>
    </VisualizationWrapper>
  ),
};
