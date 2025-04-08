import { t } from "ttag";

import { TableNotificationsTrigger } from "metabase/notifications/modals";
import { Button, Flex, Group, Icon, Title } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { EditTableDataBackButton } from "./EditTableDataBackButton";

interface EditTableDataHeaderProps {
  table: Table;
  onCreate: () => void;
}

export const EditTableDataHeader = ({
  table,
  onCreate,
}: EditTableDataHeaderProps) => {
  return (
    <Flex
      p="lg"
      data-testid="table-data-view-header"
      bd="1px solid var(--mb-color-border)"
      justify="space-between"
    >
      <Group gap="sm">
        <EditTableDataBackButton table={table} />
        <Title>{t`Editing ${table.display_name}`}</Title>
      </Group>

      <Group>
        <Button
          leftSection={<Icon name="add" />}
          variant="filled"
          onClick={onCreate}
        >{t`New record`}</Button>
        <TableNotificationsTrigger tableId={table.id} />
      </Group>
    </Flex>
  );
};
