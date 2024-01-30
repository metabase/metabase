import { useSearchListQuery } from "metabase/common/hooks";

import type { PickerItem } from "../../types";
import { ItemList } from "./ItemList";

export interface EntityItemListProps {
  query: any;
  onClick: (val: any) => void;
  selectedItem: PickerItem | null;
  folderModel: string;
}

export const EntityItemList = ({
  query,
  onClick,
  selectedItem,
  folderModel,
}: EntityItemListProps) => {
  const { data, isLoading } = useSearchListQuery<PickerItem>({ query });

  return (
    <ItemList
      items={data}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      folderModel={folderModel}
    />
  );
};
