import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";
import { ChartSettingActionIcon } from "metabase/visualizations/components/settings/ChartSettingActionIcon";
import type { OrderByDirection } from "metabase-lib";

import type { EditableTableColumnSettingItem } from "./types";

type ColumnSortingActionMenuProps = {
  columnSettings: EditableTableColumnSettingItem;
  onSort: (columnId: string, direction: OrderByDirection) => void;
};

export const ColumnSortingActionMenu = ({
  columnSettings,
  onSort,
}: ColumnSortingActionMenuProps) => {
  const { id: columnId } = columnSettings;

  const [isOpen, { close, toggle }] = useDisclosure(false);

  return (
    <Menu
      opened={isOpen}
      position="bottom-end"
      onClose={close}
      closeOnClickOutside
    >
      <Menu.Target>
        <ChartSettingActionIcon icon="ellipsis" onClick={toggle} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="arrow_up" aria-hidden />}
          onClick={() => onSort(columnId, "asc")}
        >{t`Sort ascending`}</Menu.Item>
        <Menu.Item
          leftSection={<Icon name="arrow_down" aria-hidden />}
          onClick={() => onSort(columnId, "desc")}
        >{t`Sort descending`}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
