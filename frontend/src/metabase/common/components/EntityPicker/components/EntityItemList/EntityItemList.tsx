import type { SearchResult } from "metabase-types/api";
import { useSearchListQuery } from "metabase/common/hooks";
import { Loader, Box, Text, ScrollArea, NavLink } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

import { getIcon, isSelectedItem } from "../../utils";
import { PickerColumn } from "../ItemList/ItemList.styled";

interface EntityItemListProps {
  query: any;
  onClick: (val: any) => void;
  selectedItem: SearchResult | null;
  folderModel: string;
}

export const EntityItemList = ({
  query,
  onClick,
  selectedItem,
  folderModel,
}: EntityItemListProps) => {
  const { data, isLoading } = useSearchListQuery({ query });

  if (isLoading || !data) {
    return (
      <Box miw={310}>
        <Text align="center" p="lg">
          <Loader />
        </Text>
      </Box>
    );
  }

  if (data.length === 0) {
    return (
      <Box miw={310}>
        <Text align="center" p="lg">
          No items
        </Text>
      </Box>
    );
  }

  return (
    <ScrollArea h="100%">
      <PickerColumn>
        {data.map(item => {
          const isFolder = folderModel.includes(item.model);
          const isSelected = isSelectedItem(item, selectedItem);
          return (
            <div key={item.model + item.id}>
              <NavLink
                rightSection={
                  isFolder ? <Icon name="chevronright" size={10} /> : null
                }
                label={item.name}
                active={isSelected}
                icon={<Icon name={isFolder ? "folder" : getIcon(item)} />}
                onClick={e => {
                  e.preventDefault(); // prevent form submission
                  e.stopPropagation(); // prevent parent onClick
                  onClick(item);
                }}
                variant="light"
                mb="xs"
              />
            </div>
          );
        })}
      </PickerColumn>
    </ScrollArea>
  );
};
