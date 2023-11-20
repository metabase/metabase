import type React from "react";
import { t } from "ttag";

import { CollectionEmptyIcon } from "metabase/collections/components/CollectionEmptyState/CollectionEmptyState";
import { VariableSizeItemsVirtualizedList } from "metabase/components/VirtualizedList";
import { color } from "metabase/lib/colors";
import { pluralize } from "metabase/lib/formatting";
import { Box, Text, NavLink, Loader, Center, Icon, Flex } from "metabase/ui";

import type { TypeWithModel } from "../../types";
import { getIcon, isSelectedItem } from "../../utils";

import { PickerColumn } from "./ItemList.styled";

interface ItemListProps<
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
> {
  items?: (TItem | TFolder)[];
  isLoading?: boolean;
  onClick: (val: TItem | TFolder) => void;
  selectedItem: TItem | TFolder | null;
  itemName: string;
  isFolder: (item: TItem | TFolder) => boolean;
}

export const ItemList = <
  TItem extends TypeWithModel,
  TFolder extends TypeWithModel,
>({
  items,
  isLoading = false,
  onClick,
  selectedItem,
  itemName,
  isFolder,
}: ItemListProps<TItem, TFolder>) => {
  if (isLoading) {
    return (
      <Box miw={310} h="100%">
        <Center p="lg" h="100%">
          <Loader />
        </Center>
      </Box>
    );
  }

  if (!items) {
    return null;
  }

  if (!items.length) {
    return (
      <Flex justify="center" align="center" direction="column" h="100%">
        <CollectionEmptyIcon height={47} />
        <Text align="center" p="lg" fw={700} color={color("text-light")}>
          {t`No ${pluralize(itemName)} here`}
        </Text>
      </Flex>
    );
  }

  return (
    <VariableSizeItemsVirtualizedList Wrapper={PickerColumn}>
      {items.map((item: TItem | TFolder) => (
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
            variant="light"
            mb="xs"
          />
        </div>
      ))}
    </VariableSizeItemsVirtualizedList>
  );
};
