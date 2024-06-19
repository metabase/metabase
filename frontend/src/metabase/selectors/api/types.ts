import type {
  automagicDashboardsApi,
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  segmentApi,
  tableApi,
} from "metabase/api";
import type { Database, Table } from "metabase-types/api";

export type AutomagicDashboardsEndpointName =
  keyof typeof automagicDashboardsApi.endpoints;

export type DashboardEndpointName = keyof typeof dashboardApi.endpoints;

export type CardEndpointName = keyof typeof cardApi.endpoints;

export type DatabaseEndpointName = keyof typeof databaseApi.endpoints;

export type DatasetEndpointName = keyof typeof datasetApi.endpoints;

export type SegmentEndpointName = keyof typeof segmentApi.endpoints;

export type TableEndpointName = keyof typeof tableApi.endpoints;

export interface Entity {
  id: string | number;
  updated_at: string;
}

export interface EntityEntries<E extends Entity> {
  entities: E[];
  fulfilledTimeStamp: number | undefined;
}

export type DatabaseEntries = EntityEntries<Database>;

export type TableEntries = EntityEntries<Table>;
