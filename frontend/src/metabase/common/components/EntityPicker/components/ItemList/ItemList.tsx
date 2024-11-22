import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/components/VirtualizedList";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import {
  Box,
  Center,
  Flex,
  Icon,
  NavLink,
  type NavLinkProps,
} from "metabase/ui";

import type { TypeWithModel } from "../../types";
import { getEntityPickerIcon, isSelectedItem } from "../../utils";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { PickerColumn } from "./ItemList.styled";

interface ItemListProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  items?: Item[] | null;
  isLoading?: boolean;
  error?: unknown;
  onClick: (item: Item) => void;
  selectedItem: Item | null;
  isFolder: (item: Item) => boolean;
  isCurrentLevel: boolean;
  shouldDisableItem?: (item: Item) => boolean;
  shouldShowItem?: (item: Item) => boolean;
  navLinkProps?: (isSelected?: boolean) => NavLinkProps;
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
  shouldShowItem,
  navLinkProps,
}: ItemListProps<Id, Model, Item>) => {
  const filteredItems =
    items && shouldShowItem ? items.filter(shouldShowItem) : items;
  const activeItemIndex = useMemo(() => {
    if (!filteredItems) {
      return -1;
    }

    return filteredItems.findIndex(item => isSelectedItem(item, selectedItem));
  }, [filteredItems, selectedItem]);

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading && !filteredItems) {
    return (
      <Box miw={310} h="100%" aria-label={t`Loading...`}>
        <Center p="lg" h="100%">
          <DelayedLoadingSpinner delay={300} />
        </Center>
      </Box>
    );
  }

  if (!filteredItems || !filteredItems.length) {
    return null;
  }

  return (
    <VirtualizedList Wrapper={PickerColumn} scrollTo={activeItemIndex}>
      {filteredItems.map((item: Item) => {
        const isSelected = isSelectedItem(item, selectedItem);
        const icon = getEntityPickerIcon(item, isSelected && isCurrentLevel);

        return (
          <div data-testid="picker-item" key={`${item.model}-${item.id}`}>
            <NavLink
              disabled={shouldDisableItem?.(item)}
              rightSection={
                isFolder(item) ? <Icon name="chevronright" size={10} /> : null
              }
              label={
                <Flex align="center">
                  {item.name}{" "}
                  <PLUGIN_MODERATION.ModerationStatusIcon
                    status={item.moderated_status}
                    filled
                    size={14}
                    ml="0.5rem"
                  />
                </Flex>
              }
              active={isSelected}
              icon={<Icon {...icon} />}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault(); // prevent form submission
                e.stopPropagation(); // prevent parent onClick
                onClick(item);
              }}
              variant={isCurrentLevel ? "default" : "mb-light"}
              mb="xs"
              {...navLinkProps?.(isSelected)}
            />
          </div>
        );
      })}
    </VirtualizedList>
  );
};
