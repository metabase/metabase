import { type ReactNode, useState } from "react";

import { mockSettings } from "__support__/settings";
import { getTestStoreAndWrapper } from "__support__/ui";
import { DataSectionLayout } from "metabase/data-studio/app/pages/DataSectionLayout";
import { DataStudioLayout } from "metabase/data-studio/app/pages/DataStudioLayout";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { SEMANTIC_TYPES_STORAGE_KEY } from "metabase/metadata/semantic-types";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { DataStudioTableMetadataTab } from "metabase/urls/data-studio";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  catchUnmatchedRequests,
  seedPrototypeStorage,
  setupMockApi,
} from "../CustomPropertiesPrototype/mock-api.setup.spec";
import { SemanticReviewModal } from "../SemanticReview";

import {
  WAREHOUSE_ID,
  createWarehouse,
  getFixtureFieldId,
  getFixtureTable,
} from "./fixtures";

export default {
  title: "Prototypes/Semantic additions",
  parameters: { layout: "fullscreen", loki: { skip: true } },
};

const seedStorage = () => {
  seedPrototypeStorage({
    registry: {},
    tableStructure: { tables: {}, grainByField: {} },
  });
  window.localStorage.removeItem(SEMANTIC_TYPES_STORAGE_KEY);
};

function useMockedStore({
  withRouter,
  initialRoute,
}: {
  withRouter: boolean;
  initialRoute: string;
}) {
  const [{ wrapper }] = useState(() => {
    setupMockApi({
      database: createWarehouse(),
      fieldValues: [],
      getDataset: () => null,
    });
    catchUnmatchedRequests();
    return getTestStoreAndWrapper({
      withRouter,
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
  return wrapper;
}

function DataStudioPage({ initialRoute }: { initialRoute: string }) {
  const Wrapper = useMockedStore({ withRouter: true, initialRoute });

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

function StandalonePage({ children }: { children: ReactNode }) {
  const Wrapper = useMockedStore({ withRouter: false, initialRoute: "/" });
  return <Wrapper>{children}</Wrapper>;
}

const schemaRoute = (schemaName: string) =>
  Urls.dataStudioData({ databaseId: WAREHOUSE_ID, schemaName });

const tableRoute = (
  schemaName: string,
  tableName: string,
  tab: DataStudioTableMetadataTab,
  fieldName?: string,
) => {
  const table = getFixtureTable(schemaName, tableName);
  return Urls.dataStudioData({
    databaseId: WAREHOUSE_ID,
    schemaName: table.schema,
    tableId: table.id,
    tab,
    fieldId:
      fieldName != null
        ? getFixtureFieldId(schemaName, tableName, fieldName)
        : undefined,
  });
};

export const TableList = {
  beforeEach: seedStorage,
  render: () => <DataStudioPage initialRoute={schemaRoute("hubspot")} />,
};

export const NewSubject = {
  beforeEach: seedStorage,
  render: () => (
    <DataStudioPage initialRoute={tableRoute("hubspot", "deal", "details")} />
  ),
};

export const SubjectNeedsReview = {
  beforeEach: seedStorage,
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute("hubspot", "contact", "details")}
    />
  ),
};

export const FieldReplacesSyncType = {
  beforeEach: seedStorage,
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute(
        "stripe",
        "balance_transaction",
        "field",
        "exchange_rate",
      )}
    />
  ),
};

export const FieldWithFacet = {
  beforeEach: seedStorage,
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute("hubspot", "deal", "field", "_fivetran_synced")}
    />
  ),
};

export const FieldTenantKey = {
  beforeEach: seedStorage,
  render: () => (
    <DataStudioPage
      initialRoute={tableRoute("zendesk", "ticket", "field", "organization_id")}
    />
  ),
};

export const BatchReview = {
  beforeEach: seedStorage,
  render: () => (
    <StandalonePage>
      <SemanticReviewModal
        schema={{ db_id: WAREHOUSE_ID, schema: "stripe" }}
        opened
        onClose={() => undefined}
      />
    </StandalonePage>
  ),
};
