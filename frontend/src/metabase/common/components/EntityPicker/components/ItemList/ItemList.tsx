import type React from "react";
import { useContext, useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/components/VirtualizedList";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import { Box, Center, Icon, NavLink } from "metabase/ui";

import type { TypeWithModel } from "../../types";
import { getIcon, isSelectedItem } from "../../utils";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { PickerColumn } from "./ItemList.styled";
import { PickerLinkContext } from "metabase/common/components/DashboardPicker";

interface ItemListProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  items?: Item[] | null;
  isLoading?: boolean;
  error?: unknown;
  onClick: (val: Item) => void;
  selectedItem: Item | null;
  isFolder: (item: Item) => boolean;
  isCurrentLevel: boolean;
  shouldDisableItem?: (item: Item) => boolean;
}

export const ItemList = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  items,
  isLoading = false,
  error,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
}: ItemListProps<Id, Model, Item>) => {
  const activeItemIndex = useMemo(() => {
    if (!items) {
      return -1;
    }

    return items.findIndex(item => isSelectedItem(item, selectedItem));
  }, [items, selectedItem]);

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading && !items) {
    return (
      <Box miw={310} h="100%" aria-label={t`loading`}>
        <Center p="lg" h="100%">
          <DelayedLoadingSpinner delay={300} />
        </Center>
      </Box>
    );
  }

  if (!items || !items.length) {
    return null;
  }

  const LinkComponent = useContext(PickerLinkContext) || NavLink;

  return (
    <VirtualizedList Wrapper={PickerColumn} scrollTo={activeItemIndex}>
      {items.map((item: Item) => (
        <div key={`${item.model}-${item.id}`}>
          <LinkComponent
            disabled={shouldDisableItem?.(item)}
            rightSection={
              isFolder(item) ? <Icon name="chevronright" size={10} /> : null
            }
            label={item.name}
            active={isSelectedItem(item, selectedItem)}
            icon={<Icon {...getIcon(item)} />}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault(); // prevent form submission
              e.stopPropagation(); // prevent parent onClick
              onClick(item);
            }}
            variant={isCurrentLevel ? "default" : "mb-light"}
            mb="xs"
          />
        </div>
      ))}
    </VirtualizedList>
  );
};
