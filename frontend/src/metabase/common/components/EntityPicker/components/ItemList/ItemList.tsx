import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { LoadingAndErrorWrapper } from "metabase/public/containers/PublicAction/PublicAction.styled";
import { Box, NavLink, Center, Icon, Flex } from "metabase/ui";

import type { TypeWithModel } from "../../types";
import { getIcon, isSelectedItem } from "../../utils";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { PickerColumn } from "./ItemList.styled";

interface ItemListProps<TItem extends TypeWithModel> {
  items?: TItem[];
  isLoading?: boolean;
  error?: unknown;
  onClick: (val: TItem) => void;
  selectedItem: TItem | null;
  isFolder: (item: TItem) => boolean;
  isCurrentLevel: boolean;
}

export const ItemList = <TItem extends TypeWithModel>({
  items,
  isLoading = false,
  error,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
}: ItemListProps<TItem>) => {
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
          <DelayedLoadingSpinner delay={200} />
        </Center>
      </Box>
    );
  }

  if (items && !items.length) {
    // empty array
    return (
      <Flex justify="center" align="center" direction="column" h="100%">
        <EmptyState
          illustrationElement={
            <Box aria-label={t`empty`}>
              <img src={NoResults} />
            </Box>
          }
        />
      </Flex>
    );
  }

  if (!items) {
    return null;
  }

  return (
    <VirtualizedList Wrapper={PickerColumn} scrollTo={activeItemIndex}>
      {items.map((item: TItem) => (
        <div key={`${item.model ?? "collection"}-${item.id}`}>
          <NavLink
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
