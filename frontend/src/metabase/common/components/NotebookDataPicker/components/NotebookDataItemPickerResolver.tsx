import type { EntityPickerOptions, ListProps } from "../../EntityPicker";
import type { NotebookDataPickerItem } from "../types";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";

export const NotebookDataItemPickerResolver = ({
  isCurrentLevel,
  isFolder,
  query,
  selectedItem,
  onClick,
}: ListProps<
  NotebookDataPickerItem["id"],
  NotebookDataPickerItem["model"],
  NotebookDataPickerItem,
  Query, // TODO NotebokDataPickerQuery
  EntityPickerOptions
>) => {
  if (!query) {
    return (
      <DatabaseList
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        selectedItem={selectedItem}
        onClick={onClick}
      />
    );
  }

  if (query.model === "schema") {
    return (
      <SchemaList
        query={query}
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
      />
    );
  }

  return (
    <TableList
      query={query}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
    />
  );
};
