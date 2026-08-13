import type { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { CollectionType, TokenFeatures } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatabase,
  createMockDataset,
  createMockDatasetData,
  createMockTable,
} from "metabase-types/api/mocks";
import type { createMockNotification } from "metabase-types/api/mocks/notification";

const TEST_DB_ID = 1;
export const TEST_DB = createMockDatabase({ id: TEST_DB_ID });

export const TEST_TABLE = createMockTable({
  id: 1,
  db_id: TEST_DB_ID,
});

export const TEST_COLUMN = createMockColumn({
  display_name: "Test Column",
  name: "Test Column",
});

export const TEST_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [TEST_COLUMN],
    rows: [["Test Row"]],
  }),
});

export interface SetupOpts {
  title?: string | boolean;
  withChartTypeSelector?: boolean;
  withDownloads?: boolean;
  withAlerts?: boolean;
  isEmailSetup?: boolean;
  canManageSubscriptions?: boolean;
  isSuperuser?: boolean;
  isModel?: boolean;
  notifications?: ReturnType<typeof createMockNotification>[];
  collectionType?: CollectionType;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  children?: React.ReactNode;
}
