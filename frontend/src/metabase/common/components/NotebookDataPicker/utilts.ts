import type { IsFolder } from "../EntityPicker";

import type { NotebookDataPickerItem } from "./types";

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
