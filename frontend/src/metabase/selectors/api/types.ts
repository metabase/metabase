import type {
  automagicDashboardsApi,
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  tableApi,
} from "metabase/api";

export type AutomagicDashboardsEndpointName =
  keyof typeof automagicDashboardsApi.endpoints;

export type DashboardEndpointName = keyof typeof dashboardApi.endpoints;

export type CardEndpointName = keyof typeof cardApi.endpoints;

export type DatabaseEndpointName = keyof typeof databaseApi.endpoints;

export type DatasetEndpointName = keyof typeof datasetApi.endpoints;

export type TableEndpointName = keyof typeof tableApi.endpoints;
