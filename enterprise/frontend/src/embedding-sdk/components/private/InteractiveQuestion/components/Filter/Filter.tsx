import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Group, Popover } from "metabase/ui";

import { AddBadgeListItem } from "../util/BadgeList/AddBadgeListItem";

import { DropdownFilterBadgeList } from "./DropdownFilterBadgeList";
import { FilterPicker } from "./FilterPicker";

/**
 * @category InteractiveQuestion
 */
export type InteractiveQuestionFilterProps = {
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

export const Filter = ({
  withColumnItemIcon,
}: InteractiveQuestionFilterProps) => (
  <Group>
    <DropdownFilterBadgeList withColumnItemIcon={withColumnItemIcon} />
    <AddFilterPopover />
  </Group>
);
