import { t } from "ttag";

import { Button, Divider, Flex, Group, Icon, Title } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { EditTableDataBackButton } from "./EditTableDataBackButton";

interface EditTableDataHeaderProps {
  table: Table;
  onCreateRow: () => void;
  onCreateView: () => void;
}

export const EditTableDataHeader = ({
  table,
  onCreateRow,
  onCreateView,
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
          onClick={onCreateRow}
        >{t`New record`}</Button>
        <Divider orientation="vertical" />
        <Button
          leftSection={<Icon name="table2" />}
          onClick={onCreateView}
        >{t`Create a view`}</Button>
      </Group>
    </Flex>
  );
};
