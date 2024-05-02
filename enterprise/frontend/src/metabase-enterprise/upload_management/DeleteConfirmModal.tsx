import { c, t } from "ttag";

import { Box, Flex, Text, Button, Modal } from "metabase/ui";
import type { Table } from "metabase-types/api";

export function DeleteConfirmModal({
  opened,
  tables,
  onConfirm,
  onClose,
}: {
  opened: boolean;
  tables: Table[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const title =
    tables.length === 1
      ? c("{0} is the name of a database table to be deleted")
          .t`Delete ${tables[0].display_name}?`
      : c("{0} is the number of database tables to be deleted")
          .t`Delete ${tables.length} tables?`;
  return (
    <Modal opened={opened} title={title} onClose={onClose}>
      <Box>
        <Text color="text-medium" my="lg">
          {t`This may impact the models and questions that use the table(s) as their data source. This can't be undone.`}
        </Text>
      </Box>
      <Flex gap="sm" justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="filled"
        >{t`Delete`}</Button>
      </Flex>
    </Modal>
  );
}
