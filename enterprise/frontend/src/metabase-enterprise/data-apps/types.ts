import type { DataApp, DataAppDefinition } from "metabase/data-apps/types";
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

export type UpdateDataAppStatusRequest = {
  id: DataApp["id"];
  status: DataApp["status"];
};

export type CreateDataAppRequest = Pick<DataApp, "name" | "slug">;

export type UpdateDataAppDefinitionRequest = {
  id: DataApp["id"];
  config: DataAppDefinition["config"];
};

//// canvas stuff

export type WidgetId = string;

type CommonWidgetProps = {
  id: WidgetId;
  childrenIds?: WidgetId[];
};

export type DataAppWidgetSection = CommonWidgetProps & {
  type: "section";
  childrenIds: WidgetId[];
  options: {
    width: number; // 1 - 3
  };
};

export type DataAppWidgetButton = CommonWidgetProps & {
  type: "button";
  options: {
    text: string;
  };
};

export type DataAppWidgetText = CommonWidgetProps & {
  type: "text";
  options: {
    text: string;
  };
};

export type DataAppWidgetTable = CommonWidgetProps & {
  type: "table";
  options: {
    tableId: number;
  };
};

export type DataAppWidget =
  | DataAppWidgetSection
  | DataAppWidgetButton
  | DataAppWidgetText
  | DataAppWidgetTable;
