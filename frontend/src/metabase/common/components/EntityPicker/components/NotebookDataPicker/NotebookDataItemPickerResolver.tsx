import type { EntityPickerOptions } from "../../types";
import type { EntityItemListProps } from "../ItemList";

import { DatabaseList } from "./DatabaseList";
import { SchemaList } from "./SchemaList";
import { TableList } from "./TableList";
import type { NotebookDataPickerItem } from "./types";

export const NotebookDataItemPickerResolver = ({
  isCurrentLevel,
  isFolder,
  query,
  selectedItem,
  onClick,
}: EntityItemListProps<NotebookDataPickerItem> & {
  options: EntityPickerOptions;
}) => {
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
