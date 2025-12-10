import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import {
  Box,
  type BoxProps,
  Center,
  Flex,
  Icon,
  NavLink,
  type NavLinkProps,
} from "metabase/ui";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";
import { getEntityPickerIcon, isSelectedItem } from "../../utils";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { PickerColumn } from "./ItemList.styled";

interface ItemListProps {
  pathIndex: number;
  items?: OmniPickerItem[];
  isLoading?: boolean;
  error?: unknown;
  navLinkProps?: (isSelected?: boolean) => NavLinkProps;
  containerProps?: BoxProps;
}

export function ItemList ({
  pathIndex,
  items,
  isLoading = false,
  error,
  navLinkProps,
  containerProps = { pb: "xs" },
}: ItemListProps) {
  const {
    path,
    setPath,
    isHiddenItem,
    isDisabledItem,
    isFolderItem,
    isSelectableItem,
    onChange,
    options,
  } = useOmniPickerContext();
  const selectedItem = path?.[pathIndex + 1];
  const filteredItems = items
    ? items.filter((i) => !isHiddenItem(i))
    : items;
  const isCurrentLevel = path.length - 2 === pathIndex;

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
      {filteredItems.map((item: OmniPickerItem, index) => {
        const isSelected = index === activeItemIndex;
        const icon = getEntityPickerIcon(item, isSelected && isCurrentLevel);
        const isDisabled = isDisabledItem(item);

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
                isFolderItem(item) ? <Icon name="chevronright" size={10} /> : null
              }
              mb={0}
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
              leftSection={<Icon {...icon} />}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault(); // prevent form submission
                e.stopPropagation(); // prevent parent onClick
                setPath((prevPath) => [
                  ...prevPath.slice(0, pathIndex + 1),
                  item,
                ]);

                if (!options?.hasConfirmButtons && isSelectableItem(item)) {
                  onChange(item);
                }
              }}
              variant={isCurrentLevel ? "default" : "mb-light"}
              {...navLinkProps?.(isSelected)}
            />
          </Box>
        );
      })}
    </VirtualizedList>
  );
}
