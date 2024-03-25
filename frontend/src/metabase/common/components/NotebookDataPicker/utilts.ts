import type { IsFolder } from "../EntityPicker";

import type { NotebookDataPickerItem, NotebookDataPickerQuery } from "./types";

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

export const generateKey = (query?: NotebookDataPickerQuery) =>
  JSON.stringify(query ?? "root");
