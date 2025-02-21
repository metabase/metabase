import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";

import { DropdownFilterBadgeList } from "./DropdownFilterBadgeList";
import { FilterPicker } from "./FilterPicker";
import type { FilterProps } from "./types";

const AddFilterPopover = () => {
  const [opened, { close, toggle }] = useDisclosure();

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <AddBadgeListItem name={t`Add another filter`} onClick={toggle} />
      </Popover.Target>
      <Popover.Dropdown>
        <FilterPicker onClose={close} onBack={close} />
      </Popover.Dropdown>
    </Popover>
  );
};

export const Filter = ({ withColumnItemIcon }: FilterProps) => (
  <Group>
    <DropdownFilterBadgeList withColumnItemIcon={withColumnItemIcon} />
    <AddFilterPopover />
  </Group>
);
