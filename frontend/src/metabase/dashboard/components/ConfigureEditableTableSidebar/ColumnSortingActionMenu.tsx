import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Icon, Menu, Tooltip } from "metabase/ui";
import { ChartSettingActionIcon } from "metabase/visualizations/components/settings/ChartSettingActionIcon";
import type { OrderByDirection } from "metabase-lib";

import type { EditableTableColumnSettingItem } from "./types";

type ColumnSortingActionMenuProps = {
  columnSettings: EditableTableColumnSettingItem;
  onSort: (columnId: string, direction: OrderByDirection | null) => void;
};

export const ColumnSortingActionMenu = ({
  columnSettings,
  onSort,
}: ColumnSortingActionMenuProps) => {
  const { id: columnId, sortDirection } = columnSettings;

  const [isOpen, { close, toggle }] = useDisclosure(false);

  const handleClick = () => {
    if (!sortDirection) {
      onSort(columnId, "asc");
    }

    toggle();
  };

  const icon = !sortDirection
    ? "sort"
    : sortDirection === "asc"
      ? "arrow_up"
      : "arrow_down";

  return (
    <Menu
      opened={isOpen}
      position="bottom-end"
      onClose={close}
      closeOnClickOutside
    >
      <Menu.Target>
        <Tooltip
          label={!sortDirection ? t`Sort by this column` : t`Change sorting`}
        >
          <ChartSettingActionIcon icon={icon} onClick={handleClick} />
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {sortDirection === "asc" ? (
          <Menu.Item
            leftSection={<Icon name="arrow_down" c="brand" aria-hidden />}
            onClick={() => onSort(columnId, "desc")}
          >{t`Sort descending`}</Menu.Item>
        ) : (
          <Menu.Item
            leftSection={<Icon name="arrow_up" c="brand" aria-hidden />}
            onClick={() => onSort(columnId, "asc")}
          >{t`Sort ascending`}</Menu.Item>
        )}
        <Menu.Item
          leftSection={<Icon name="close" c="brand" aria-hidden />}
          onClick={() => onSort(columnId, null)}
        >{t`Remove Sorting`}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
