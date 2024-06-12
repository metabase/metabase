import type { databaseApi, tableApi } from "metabase/api";

export type DatabaseEndpointName = keyof typeof databaseApi.endpoints;

export type TableEndpointName = keyof typeof tableApi.endpoints;
