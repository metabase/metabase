import { useDisclosure } from "@mantine/hooks";

import { Group, Popover } from "metabase/ui";

import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import type { InteractiveQuestionFilterProps } from "./Filter";
import { FilterPicker } from "./FilterPicker";
import { type SDKFilterItem, useFilterData } from "./hooks/use-filter-data";

const DropdownFilterBadgeListContent = ({
  item,
  withColumnItemIcon,
}: {
  item: SDKFilterItem;
} & InteractiveQuestionFilterProps) => {
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
}: InteractiveQuestionFilterProps) => {
  const filterItems = useFilterData();

  return (
    <Group gap="sm">
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
