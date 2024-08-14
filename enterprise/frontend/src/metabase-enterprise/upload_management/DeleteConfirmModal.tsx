import { useState } from "react";
import { c, ngettext, t, msgid } from "ttag";

import { Box, Flex, Text, Button, Modal, Switch } from "metabase/ui";
import type { Table } from "metabase-types/api";

export function DeleteConfirmModal({
  opened,
  tables,
  onConfirm,
  onClose,
}: {
  opened: boolean;
  tables: Table[];
  onConfirm: (sendToTrash: boolean) => void;
  onClose: () => void;
}) {
  const [sendToTrash, setSendToTrash] = useState(true);
  const title =
    tables.length === 1
      ? c("{0} is the name of a database table to be deleted")
          .t`Delete ${tables[0].name}?`
      : c("{0} is the number of database tables to be deleted")
          .t`Delete ${tables.length} tables?`;

  return (
    <Modal
      opened={opened}
      title={
        <Text size="lg" style={{ wordBreak: "break-all" }}>
          {title}
        </Text>
      }
      onClose={onClose}
      size="md"
    >
      <Box>
        <Text my="lg">
          {t`This may impact the models and questions that use the table(s) as their data source. This can't be undone.`}
        </Text>
      </Box>
      <Box mb="lg">
        <Switch
          size="sm"
          checked={sendToTrash}
          label={ngettext(
            msgid`Also send all models and questions based on this table to the trash`,
            `Also send all models and questions based on these tables to the trash`,
            tables.length,
          )}
          onChange={e => setSendToTrash(e.target.checked)}
        />
      </Box>
      <Flex gap="sm" justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          onClick={() => onConfirm(sendToTrash)}
          color="error"
          variant="filled"
        >{t`Delete`}</Button>
      </Flex>
    </Modal>
  );
}
