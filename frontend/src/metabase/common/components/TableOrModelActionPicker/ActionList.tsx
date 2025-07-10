import { useMemo } from "react";
import { t } from "ttag";

import type { ActionItem } from "metabase/common/components/DataPicker/types";
import { ItemList, ListBox } from "metabase/common/components/EntityPicker";
import { Box } from "metabase/ui";
import type { ListActionItem } from "metabase-types/api";

interface Props {
  error: unknown;
  isLoading: boolean;
  isCurrentLevel: boolean;
  selectedItem: ActionItem | null;
  actions: ListActionItem[] | undefined;
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
      {items?.length === 0 ? (
        <Box p="2rem" ta="center" c="text-medium">
          <div>{t`There are no actions for this model`}</div>
        </Box>
      ) : (
        <ItemList
          error={error}
          isCurrentLevel={isCurrentLevel}
          isFolder={isFolder}
          isLoading={isLoading}
          items={items}
          selectedItem={selectedItem}
          onClick={onClick}
        />
      )}
    </ListBox>
  );
};
