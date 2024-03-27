import type { EntityPickerOptions, ListProps } from "../../EntityPicker";
import type { NotebookDataPickerItem, NotebookDataPickerQuery } from "../types";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";

export const DataPickerListResolver = ({
  isCurrentLevel,
  isFolder,
  model,
  query,
  selectedItem,
  onClick,
}: ListProps<
  NotebookDataPickerItem["id"],
  NotebookDataPickerItem["model"],
  NotebookDataPickerItem,
  NotebookDataPickerQuery<NotebookDataPickerItem["model"]>,
  EntityPickerOptions
>) => {
  if (model === "card" || model === "collection") {
    throw new Error("Not implemented");
  }

  if (model === "database") {
    return (
      <DatabaseList
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        query={query}
        selectedItem={selectedItem}
        onClick={onClick}
      />
    );
  }

  if (model === "schema") {
    return (
      <SchemaList
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        query={query}
        selectedItem={selectedItem}
        onClick={onClick}
      />
    );
  }

  return (
    <TableList
      isCurrentLevel={isCurrentLevel}
      isFolder={isFolder}
      query={query}
      selectedItem={selectedItem}
      onClick={onClick}
    />
  );
};
