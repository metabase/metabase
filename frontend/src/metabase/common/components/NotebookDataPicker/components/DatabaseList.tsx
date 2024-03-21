import { useDatabaseListQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { ItemList, type IsFolder } from "../../EntityPicker";
import type { NotebookDataPickerItem } from "../types";

interface Props {
  selectedItem: NotebookDataPickerItem | null;
  isFolder: IsFolder<
    NotebookDataPickerItem["id"],
    NotebookDataPickerItem["model"],
    NotebookDataPickerItem
  >;
  isCurrentLevel: boolean;
  onClick: (val: NotebookDataPickerItem) => void;
}

export const DatabaseList = ({
  isCurrentLevel,
  isFolder,
  selectedItem,
  onClick,
}: Props) => {
  const {
    data: databases = [],
    error,
    isLoading,
  } = useDatabaseListQuery({
    query: { saved: false }, // saved questions are fetched in a separate tab
  });

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
