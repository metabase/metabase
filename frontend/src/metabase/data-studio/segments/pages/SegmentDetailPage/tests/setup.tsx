import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupSchemaEndpoints,
  setupSegmentEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { DataModelSegmentBreadcrumbs } from "metabase/data-studio/segments/components/SegmentBreadcrumbs";
import { SegmentDetailPage } from "metabase/data-studio/segments/pages/SegmentDetailPage";
import { checkNotNull } from "metabase/lib/types";
import type {
  EnterpriseSettings,
  Segment,
  Table,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockStructuredDatasetQuery,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export const TEST_TABLE = createMockTable({
  id: 42,
  display_name: "Orders",
  schema: "PUBLIC",
  fields: [
    createMockField({
      id: 1,
      table_id: 42,
      name: "ID",
      display_name: "ID",
      base_type: "type/Integer",
      semantic_type: "type/PK",
    }),
    createMockField({
      id: 2,
      table_id: 42,
      name: "TOTAL",
      display_name: "Total",
      base_type: "type/Float",
      semantic_type: null,
    }),
  ],
});

export const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "Test Database",
});

TEST_TABLE.db_id = TEST_DATABASE.id;
TEST_TABLE.db = TEST_DATABASE;

export const TEST_SEGMENT = createMockSegment({
  id: 1,
  name: "High Value Orders",
  description: "Orders with total > 100",
  table_id: TEST_TABLE.id,
  definition: createMockStructuredDatasetQuery({
    database: TEST_DATABASE.id,
    query: {
      "source-table": TEST_TABLE.id,
      filter: [">", ["field", 2, null], 100],
    },
  }),
});

type SetupOpts = {
  segment?: Segment;
  table?: Table;
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
};

export function setup({
  segment = TEST_SEGMENT,
  table = TEST_TABLE,
  isAdmin = true,
  enterprisePlugins,
  tokenFeatures,
  remoteSyncType,
}: SetupOpts = {}) {
  setupSegmentEndpoint(segment);
  setupSchemaEndpoints(checkNotNull(table.db));

  const baseUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/segments/${segment.id}`;

  const tabUrls = {
    definition: baseUrl,
    revisions: `${baseUrl}/revisions`,
    dependencies: `${baseUrl}/dependencies`,
  };

  const onRemove = jest.fn().mockResolvedValue(undefined);

  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    entities: createMockEntitiesState({
      databases: [TEST_DATABASE],
      tables: [table],
    }),
    settings,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SegmentDetailPage
          route={{ path: "/" } as never}
          segment={segment}
          tabUrls={tabUrls}
          breadcrumbs={
            <DataModelSegmentBreadcrumbs table={table} segment={segment} />
          }
          onRemove={onRemove}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );

  return { onRemove };
}
