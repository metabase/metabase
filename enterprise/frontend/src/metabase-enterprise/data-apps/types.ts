import type { DataApp } from "metabase/data-apps/types";
import type { PaginationResponse } from "metabase-types/api";

export type DataAppEditSettings = {
  name: DataApp["name"];
  slug: DataApp["slug"];
};

export type DataAppsListResponse = {
  data: DataApp[];
} & PaginationResponse;

export type UpdatableDataAppSettings = Pick<
  DataApp,
  "name" | "slug" | "description" | "definition"
>;

export type UpdateDataAppRequest = {
  id: DataApp["id"];
} & Partial<UpdatableDataAppSettings>;

export type CreateDataAppRequest = Pick<DataApp, "name" | "slug">;

export type UpdateDataAppDefinitionRequest = {
  id: DataApp["id"];
  config: DataApp["definition"]["config"];
};
