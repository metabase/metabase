import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { FilterColumnPickerProps } from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";

import { DropdownFilterBadgeList } from "./DropdownFilterBadgeList";
import { FilterPicker } from "./FilterPicker";

export type FilterProps = Pick<FilterColumnPickerProps, "withColumnItemIcon">;

const AddFilterPopover = () => {
  const [opened, { close, toggle }] = useDisclosure();

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <AddBadgeListItem name={t`Add another filter`} onClick={toggle} />
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker onClose={close} />
      </Popover.Dropdown>
    </Popover>
  );
};

export const Filter = ({ withColumnItemIcon }: FilterProps) => (
  <Group>
    <DropdownFilterBadgeList withColumnGroupIcon={withColumnItemIcon} />
    <AddFilterPopover />
  </Group>
);
