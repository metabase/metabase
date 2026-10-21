import { useMemo } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { getIsTenantUser } from "metabase/current-user";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { type BoxProps, Flex, type NavLinkProps } from "metabase/ui";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";
import {
  findCustomFolder,
  isSelectedItem,
  useGetEntityPickerIcon,
} from "../../utils";
import { ItemListLoader } from "../ItemListLoader";

import { PickerColumn, PickerItemRow } from "./PickerItemRow";

interface ItemListProps {
  pathIndex: number;
  items?: OmniPickerItem[];
  isLoading?: boolean;
  error?: unknown;
  navLinkProps?: (isSelected?: boolean) => NavLinkProps;
  containerProps?: BoxProps;
}

export function ItemList({
  pathIndex,
  items,
  isLoading = false,
  error,
  navLinkProps,
  containerProps = { pb: "xxs" },
}: ItemListProps) {
  const tc = useTranslateContent();
  const {
    path,
    setPath,
    customFolders,
    isHiddenItem,
    isDisabledItem,
    isFolderItem,
    isSelectableItem,
    onChange,
    options,
  } = useOmniPickerContext();
  const selectedItem = path?.[pathIndex + 1];
  const filteredItems = useMemo(() => {
    return items ? items.filter((i) => !isHiddenItem(i)) : items;
  }, [items, isHiddenItem]);
  // A custom folder's selected item isn't in the path, so the folder's own column is a parent level.
  const selectedCustomFolder = selectedItem
    ? findCustomFolder(customFolders, selectedItem)
    : undefined;
  const isCurrentLevel =
    path.length - 2 === pathIndex &&
    !selectedCustomFolder?.items.some((item) => item.isSelected);
  const isTenantUser = useSelector(getIsTenantUser);
  const getEntityPickerIcon = useGetEntityPickerIcon();

  const activeItemIndex = useMemo(() => {
    if (!filteredItems || !selectedItem) {
      return -1;
    }

    return filteredItems.findIndex((item) =>
      isSelectedItem(item, selectedItem),
    );
  }, [filteredItems, selectedItem]);

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (isLoading) {
    return <ItemListLoader />;
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
      {filteredItems.map((item: OmniPickerItem, index) => {
        const isSelected = index === activeItemIndex;

        return (
          <PickerItemRow
            key={`${item.model}-${item.id}`}
            label={
              <Flex align="center">
                {tc(item.name)}{" "}
                <PLUGIN_MODERATION.ModerationStatusIcon
                  status={"moderated_status" in item && item.moderated_status}
                  filled
                  size={14}
                  ml="0.5rem"
                />
              </Flex>
            }
            icon={getEntityPickerIcon(item, {
              isSelected: isSelected && isCurrentLevel,
              isTenantUser,
            })}
            isSelected={isSelected}
            isCurrentLevel={isCurrentLevel}
            isFolder={isFolderItem(item)}
            isDisabled={isDisabledItem(item)}
            tooltip={options.getItemTooltip?.(item)}
            containerProps={containerProps}
            navLinkProps={navLinkProps?.(isSelected)}
            onClick={() => {
              setPath((prevPath) => [
                ...prevPath.slice(0, pathIndex + 1),
                item,
              ]);

              if (!options?.hasConfirmButtons && isSelectableItem(item)) {
                onChange(item);
              }
            }}
          />
        );
      })}
    </VirtualizedList>
  );
}
