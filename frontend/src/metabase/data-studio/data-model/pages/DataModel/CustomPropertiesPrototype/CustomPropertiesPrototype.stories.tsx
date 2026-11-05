import { type ReactElement, useState } from "react";

import { mockSettings } from "__support__/settings";
import { getTestStoreAndWrapper } from "__support__/ui";
import { DataSectionLayout } from "metabase/data-studio/app/pages/DataSectionLayout";
import { DataStudioLayout } from "metabase/data-studio/app/pages/DataStudioLayout";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { Outlet, Route } from "metabase/router";
import { getDataStudioTransformRoutes } from "metabase/transforms/routes";
import * as Urls from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  MetabotComparisonPrototype,
  MetabotDiscoveryPrototype,
} from "./MetabotPrototype";
import {
  CURATED_REGISTRY,
  CUSTOMER_PROPERTIES_ID,
  DEALS_ID,
  DEAL_AMOUNT_FIELD_ID,
  EMPTY_TABLE_STRUCTURE,
  WAREHOUSE_FIELD_VALUES,
  WAREHOUSE_ID,
  createWarehouse,
} from "./fixtures";
import {
  catchUnmatchedRequests,
  seedPrototypeStorage,
  setupMockApi,
} from "./mock-api.setup.spec";
import { getPropertyRegistryDataset } from "./property-profiles";

registerVisualizations();

export default {
  title: "Prototypes/Custom property tables",
  parameters: { layout: "fullscreen" },
};

function DataStudioPage({ initialRoute }: { initialRoute: string }) {
  const [{ wrapper: Wrapper }] = useState(() => {
    seedPrototypeStorage({
      registry: CURATED_REGISTRY,
      tableStructure: EMPTY_TABLE_STRUCTURE,
    });
    setupMockApi({
      database: createWarehouse(),
      fieldValues: WAREHOUSE_FIELD_VALUES,
      getDataset: getPropertyRegistryDataset,
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
          "transforms-enabled": true,
          "transforms-setup-complete": true,
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
          <Route path="transforms">{getDataStudioTransformRoutes()}</Route>
        </Route>
      </Wrapper>
    </div>
  );
}

export const DataStudioRegistry = {
  render: () => (
    <DataStudioPage
      initialRoute={Urls.dataStudioData({
        databaseId: WAREHOUSE_ID,
        schemaName: "public",
        tableId: CUSTOMER_PROPERTIES_ID,
        tab: "details",
      })}
    />
  ),
};

export const DataStudioWildcardField = {
  render: () => (
    <DataStudioPage
      initialRoute={Urls.dataStudioData({
        databaseId: WAREHOUSE_ID,
        schemaName: "public",
        tableId: DEALS_ID,
        tab: "field",
        fieldId: DEAL_AMOUNT_FIELD_ID,
      })}
    />
  ),
};

function MetabotPage({ children }: { children: ReactElement }) {
  const [{ wrapper: Wrapper }] = useState(() => {
    seedPrototypeStorage({
      registry: CURATED_REGISTRY,
      tableStructure: EMPTY_TABLE_STRUCTURE,
    });
    setupMockApi({
      database: createWarehouse(),
      fieldValues: WAREHOUSE_FIELD_VALUES,
      getDataset: getPropertyRegistryDataset,
    });
    catchUnmatchedRequests();
    return getTestStoreAndWrapper({
      withRouter: false,
      withKBar: false,
      withDND: false,
      initialRoute: "/",
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    });
  });

  return <Wrapper>{children}</Wrapper>;
}

export const MetabotPropertyContext = {
  render: () => (
    <MetabotPage>
      <MetabotComparisonPrototype />
    </MetabotPage>
  ),
};

export const MetabotPropertyDiscovery = {
  render: () => (
    <MetabotPage>
      <MetabotDiscoveryPrototype />
    </MetabotPage>
  ),
};
