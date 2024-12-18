import { Group, Popover } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import { FilterPicker } from "./FilterPicker";
import { type SDKFilterItem, useFilterData } from "./hooks/use-filter-data";
import type { FilterProps } from "./types";

const DropdownFilterBadgeListContent = ({
  item,
  withColumnItemIcon,
}: {
  item: SDKFilterItem;
} & FilterProps) => {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <BadgeListItem
          onClick={open}
          onRemoveItem={() => item.onRemoveFilter()}
          name={item.displayName}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker
          filterItem={item}
          withIcon={withColumnItemIcon}
          onClose={close}
          onBack={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
};

export const DropdownFilterBadgeList = ({
  withColumnItemIcon,
}: FilterProps) => {
  const filterItems = useFilterData();

  return (
    <Group spacing="sm">
      {filterItems.map((item, index) => (
        <DropdownFilterBadgeListContent
          key={`${item.name}/${index}`}
          item={item}
          withColumnItemIcon={withColumnItemIcon}
        />
      ))}
    </Group>
  );
};
