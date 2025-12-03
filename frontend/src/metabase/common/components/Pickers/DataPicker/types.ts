import type {
  CardId,
  Collection,
  DashboardId,
  DatabaseId,
} from "metabase-types/api";

import type { EntityPickerModalOptions } from "../../EntityPicker";
import type { QuestionPickerOptions } from "../QuestionPicker";
import type {
  DatabaseItem,
  SchemaItem,
  TableItem,
  TablePickerValue,
} from "../TablePicker/types";

export type CollectionItem = {
  id: Collection["id"];
  name: Collection["name"];
  model: "collection";
};

export type QuestionItem = {
  id: CardId;
  name: string;
  model: "card";
  database_id: DatabaseId;
};

export type DashboardItem = {
  id: DashboardId;
  name: string;
  model: "dashboard";
};

export type ModelItem = {
  id: CardId;
  name: string;
  model: "dataset";
  database_id: DatabaseId;
};

export type MetricItem = {
  id: CardId;
  name: string;
  model: "metric";
  database_id: DatabaseId;
};

export type DataPickerValue =
  | TablePickerValue
  | QuestionItem
  | ModelItem
  | MetricItem;

export type DataPickerFolderItem =
  | CollectionItem
  | DatabaseItem
  | SchemaItem
  | DashboardItem;

export type DataPickerValueItem =
  | TableItem
  | QuestionItem
  | ModelItem
  | MetricItem;

export type DataPickerItem = DataPickerFolderItem | DataPickerValueItem;

export type DataPickerModalOptions = EntityPickerModalOptions &
  QuestionPickerOptions & {
    showDatabases?: boolean;
  };
