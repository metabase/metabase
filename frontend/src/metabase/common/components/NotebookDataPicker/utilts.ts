import type { IsFolder } from "../EntityPicker";

import type {
  NotebookDataPickerId,
  NotebookDataPickerItem,
  NotebookDataPickerModel,
} from "./types";

export const isFolder: IsFolder<
  NotebookDataPickerId,
  NotebookDataPickerModel,
  NotebookDataPickerItem
> = item => {
  return (
    item.model === "database" ||
    item.model === "schema" ||
    item.model === "collection"
  );
};
