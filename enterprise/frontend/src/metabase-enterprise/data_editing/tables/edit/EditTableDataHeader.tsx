import { t } from "ttag";

import { Button, Flex, Group, Icon, Title } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { EditTableDataBackButton } from "./EditTableDataBackButton";

interface EditTableDataHeaderProps {
  table: Table;
  onCreate: () => void;
  onDelete: () => void;
}

export const EditTableDataHeader = ({
  table,
  onCreate,
  // onDelete,
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
        {/* <Button
          leftSection={<Icon name="trash" />}
          disabled
          onClick={onDelete}
        >{t`Delete`}</Button> */}
      </Group>
    </Flex>
  );
};
