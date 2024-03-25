import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import type { DatabaseListQuery } from "metabase-types/api";

import { ItemList, type IsFolder } from "../../EntityPicker";
import type { NotebookDataPickerItem } from "../types";

interface Props {
  isCurrentLevel: boolean;
  isFolder: IsFolder<
    NotebookDataPickerItem["id"],
    NotebookDataPickerItem["model"],
    NotebookDataPickerItem
  >;
  query: DatabaseListQuery;
  selectedItem: NotebookDataPickerItem | null;
  onClick: (val: NotebookDataPickerItem) => void;
}

export const DatabaseList = ({
  isCurrentLevel,
  isFolder,
  query,
  selectedItem,
  onClick,
}: Props) => {
  const {
    data: databases = [],
    error,
    isLoading,
  } = useDatabaseListQuery({ query });

  const items: NotebookDataPickerItem[] = databases.map(database => ({
    description: database.description,
    id: database.id,
    model: "database",
    name: database.displayName(),
  }));

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  return (
    <ItemList
      isCurrentLevel={isCurrentLevel}
      isFolder={isFolder}
      isLoading={isLoading}
      items={items}
      selectedItem={selectedItem}
      onClick={onClick}
    />
  );
};
