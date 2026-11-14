import { t } from "ttag";

import { useTableSyncActions } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableActionsMenu";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Table } from "metabase-types/api";

/** The table's sync actions in an overflow menu, beside the fields' search */
export function TableSyncMenu({ table }: { table: Table }) {
  const { syncSchema, rescanFieldValues, discardFieldValues } =
    useTableSyncActions(table);

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size="lg" variant="default" aria-label={t`More actions`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Icon name="sync" />} onClick={syncSchema}>
          {t`Sync table schema`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="list" />}
          onClick={rescanFieldValues}
        >
          {t`Re-scan field values`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={discardFieldValues}
        >
          {t`Discard cached field values`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
