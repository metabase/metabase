import { useMemo } from "react";

import type { ActionItem } from "metabase/common/components/DataPicker/types";
import { ItemList, ListBox } from "metabase/common/components/EntityPicker";
import type { DataGridWritebackAction } from "metabase-types/api";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: ActionItem | null;
  actions: DataGridWritebackAction[] | undefined;
  onClick: (item: ActionItem) => void;
}

const isFolder = () => false;

export const ActionList = ({
  error,
  isLoading,
  isCurrentLevel,
  selectedItem,
  actions,
  onClick,
}: Props) => {
  const items: ActionItem[] | undefined = useMemo(() => {
    return actions?.map((action) => ({
      id: action.id,
      model: "action",
      name: action.name,
    }));
  }, [actions]);

  return (
    <ListBox data-testid="item-picker-level-3">
      <ItemList
        error={error}
        isCurrentLevel={isCurrentLevel}
        isFolder={isFolder}
        isLoading={isLoading}
        items={items}
        selectedItem={selectedItem}
        onClick={onClick}
      />
    </ListBox>
  );
};
