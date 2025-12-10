import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker";
import { getEntityPickerIcon, isSelectedItem } from "metabase/common/components/EntityPicker/utils";
import { VirtualizedList } from "metabase/common/components/VirtualizedList";
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

import { useOmniPickerContext } from "../../context";
import type { OmniPickerItem } from "../../types";

interface ItemListProps {
  items: OmniPickerItem[] | undefined;
  isLoading?: boolean;
  error?: unknown;
  pathIndex: number;
  navLinkProps?: (isSelected?: boolean) => NavLinkProps;
}

export const ItemList = ({
  items,
  isLoading = false,
  error,
  navLinkProps,
  pathIndex,
}: ItemListProps) => {
  const {
    setPath, isFolderItem, isHiddenItem, isDisabledItem, selectedItem, path,
  } = useOmniPickerContext();
  const isLastLevel = path.length - 1 === pathIndex;
  const filteredItems = items
    ? items.filter(i => !isHiddenItem(i))
    : items;

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
      Wrapper={(props) => <Box className="pickerColumn" {...props} />}
      scrollTo={activeItemIndex}
      estimatedItemSize={37}
    >
      {filteredItems.map((item: OmniPickerItem) => {
        const isSelected = isSelectedItem(item, selectedItem);
        const icon = getEntityPickerIcon(item, isSelected && isLastLevel);
        const isDisabled = isDisabledItem(item);

        return (
          <Box
            data-testid="picker-item"
            key={`${item.model}-${item.id}`}
          >
            <NavLink
              w={"10rem"}
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
                setPath((prevPath) => ([
                  ...prevPath.slice(0, pathIndex + 1),
                  item,
                ]));
              }}
              variant={isLastLevel ? "default" : "mb-light"}
              {...navLinkProps?.(isSelected)}
            />
          </Box>
        );
      })}
    </VirtualizedList>
  );
};
