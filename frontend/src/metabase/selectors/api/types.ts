import type { databaseApi, datasetApi, tableApi } from "metabase/api";

export type DatabaseEndpointName = keyof typeof databaseApi.endpoints;

export type DatasetEndpointName = keyof typeof datasetApi.endpoints;

export type TableEndpointName = keyof typeof tableApi.endpoints;
