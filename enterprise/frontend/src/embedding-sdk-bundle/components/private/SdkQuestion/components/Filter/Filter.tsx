import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";

import { DropdownFilterBadgeList } from "./DropdownFilterBadgeList";
import { FilterPicker } from "./FilterPicker";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type FilterProps = {
  /**
   * Whether to show the icon for the column item
   */
  withColumnItemIcon?: boolean;
};

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

/**
 * A set of interactive filter badges that allow adding, editing, and removing filters.
 * Displays current filters as badges with an "Add another filter" option.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const Filter = ({ withColumnItemIcon }: FilterProps) => (
  <Group>
    <DropdownFilterBadgeList withColumnItemIcon={withColumnItemIcon} />
    <AddFilterPopover />
  </Group>
);
