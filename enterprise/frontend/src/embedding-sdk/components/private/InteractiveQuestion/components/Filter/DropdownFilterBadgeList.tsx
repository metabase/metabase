import { Group, Popover } from "@mantine/core";

import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import { FilterPicker } from "./FilterPicker";
import { useFilterData } from "./hooks/use-filter-data";
import type { FilterProps } from "./types";

export const DropdownFilterBadgeList = ({
  withColumnItemIcon,
}: FilterProps) => {
  const filterItems = useFilterData();

  return (
    <Group spacing="sm">
      {filterItems.map((item, index) => (
        <Popover key={`${item.name}/${index}`}>
          <Popover.Target>
            <BadgeListItem
              onRemoveItem={() => item.onRemoveFilter()}
              name={item.displayName}
            />
          </Popover.Target>
          <Popover.Dropdown>
            <FilterPicker filterItem={item} withIcon={withColumnItemIcon} />
          </Popover.Dropdown>
        </Popover>
      ))}
    </Group>
  );
};
