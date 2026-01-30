import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { useTranslateContent } from "metabase/i18n/hooks";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import { getIsTenantUser } from "metabase/selectors/user";
import {
  Box,
  type BoxProps,
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
  containerProps?: BoxProps;
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
  containerProps = { pb: "xs" },
}: ItemListProps<Id, Model, Item>) => {
  const tc = useTranslateContent();

  const isTenantUser = useSelector(getIsTenantUser);
  const filteredItems =
    items && shouldShowItem ? items.filter(shouldShowItem) : items;
  const activeItemIndex = useMemo(() => {
    if (!filteredItems) {
      return -1;
    }

    return filteredItems.findIndex((item) =>
      isSelectedItem(item, selectedItem),
    );
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
    <VirtualizedList
      Wrapper={PickerColumn}
      scrollTo={activeItemIndex}
      estimatedItemSize={37}
    >
      {filteredItems.map((item: Item) => {
        const isSelected = isSelectedItem(item, selectedItem);
        const icon = getEntityPickerIcon(item, {
          isSelected: isSelected && isCurrentLevel,
          isTenantUser,
        });
        const isDisabled = shouldDisableItem?.(item);

        return (
          <Box
            data-testid="picker-item"
            key={`${item.model}-${item.id}`}
            {...containerProps}
          >
            <NavLink
              w={"auto"}
              disabled={isDisabled}
              rightSection={
                isFolder(item) ? <Icon name="chevronright" size={10} /> : null
              }
              mb={0}
              label={
                <Flex align="center">
                  {tc(item.name)}{" "}
                  <PLUGIN_MODERATION.ModerationStatusIcon
                    status={item.moderated_status}
                    filled
                    size={14}
                    ml="0.5rem"
                  />
                </Flex>
              }
              active={isSelected}
              leftSection={<Icon {...icon} />}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault(); // prevent form submission
                e.stopPropagation(); // prevent parent onClick
                onClick(item);
              }}
              variant={isCurrentLevel ? "default" : "mb-light"}
              {...navLinkProps?.(isSelected)}
            />
          </Box>
        );
      })}
    </VirtualizedList>
  );
};
