import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { FilterColumnPickerProps } from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";

import { FilterBar } from "./FilterBar";
import { FilterPicker } from "./FilterPicker";

export type FilterProps = Pick<
  FilterColumnPickerProps,
  "withColumnItemIcon" | "withColumnGroupIcon" | "withCustomExpression"
>;

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
    <FilterBar withColumnGroupIcon={withColumnItemIcon} />
    <AddFilterPopover />
  </Group>
);
