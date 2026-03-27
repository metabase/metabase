import { useDisclosure } from "@mantine/hooks";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Group, Popover } from "metabase/ui";

import { BadgeListItem } from "../util/BadgeList/BadgeListItem";

import type { FilterProps } from "./Filter";
import { FilterPicker } from "./FilterPicker";
import { type SDKFilterItem, useFilterData } from "./hooks/use-filter-data";

const DropdownFilterBadgeListContent = ({
  item,
  withColumnItemIcon,
}: {
  item: SDKFilterItem;
} & FilterProps) => {
  const [opened, { open, close }] = useDisclosure(false);
  const tc = useTranslateContent();
  const { locale } = useLocale();

  return (
    <Popover opened={opened} onClose={close}>
      <Popover.Target>
        <BadgeListItem
          onClick={open}
          onRemoveItem={() => item.onRemoveFilter()}
          name={PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
            displayName: item.displayName,
            tc,
            locale,
          })}
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
