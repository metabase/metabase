import type { IsFolder } from "../EntityPicker";

import type {
  NotebookDataPickerItem,
  NotebookDataPickerModel,
  NotebookDataPickerQuery,
  PathEntry,
} from "./types";

export const isFolder: IsFolder<
  NotebookDataPickerItem["id"],
  NotebookDataPickerItem["model"],
  NotebookDataPickerItem
> = item => {
  return (
    item.model === "database" ||
    item.model === "schema" ||
    item.model === "collection"
  );
};

export const generateKey = (item?: PathEntry) => {
  return [item.model, JSON.stringify(item.query ?? "root")].join("-");
};
