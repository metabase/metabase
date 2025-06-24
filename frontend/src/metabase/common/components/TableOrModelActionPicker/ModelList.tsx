import { useMemo } from "react";

import type { ModelItem } from "metabase/common/components/DataPicker/types";
import { ItemList, ListBox } from "metabase/common/components/EntityPicker";
import type { CardId, SearchResult } from "metabase-types/api";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: ModelItem | null;
  models: SearchResult<CardId>[] | undefined;
  onClick: (item: ModelItem) => void;
}

const isFolder = () => true;

export const ModelList = ({
  error,
  isLoading,
  isCurrentLevel,
  selectedItem,
  models,
  onClick,
}: Props) => {
  const items: ModelItem[] | undefined = useMemo(() => {
    return models?.map((action) => ({
      id: action.id,
      model: "dataset",
      name: action.name,
    }));
  }, [models]);

  return (
    <ListBox data-testid="item-picker-level-1">
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
