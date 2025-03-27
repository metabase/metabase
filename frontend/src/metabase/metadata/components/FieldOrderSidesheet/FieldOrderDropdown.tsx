import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableFieldOrder } from "metabase-types/api";

interface Props {
  table: Table;
  onUpdateTable: (table: Table, name: string, value: TableFieldOrder) => void;
}

export const FieldOrderDropdown = ({ table, onUpdateTable }: Props) => {
  const handleItemClick = (value: TableFieldOrder) => {
    onUpdateTable(table, "field_order", value);
  };

  return (
    <Menu position="bottom-start">
      <Menu.Target>
        <Button
          leftSection={<Icon name="sort_arrows" />}
          p={0}
          variant="subtle"
        >
          {t`Sort`}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          onClick={() => handleItemClick("database")}
        >{t`Database`}</Menu.Item>

        <Menu.Item
          onClick={() => handleItemClick("alphabetical")}
        >{t`Alphabetical`}</Menu.Item>

        <Menu.Item
          onClick={() => handleItemClick("custom")}
        >{t`Custom`}</Menu.Item>

        <Menu.Item
          onClick={() => handleItemClick("smart")}
        >{t`Smart`}</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
