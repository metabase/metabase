import { useState } from "react";
import { c, msgid, ngettext, t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import { Box, Switch, Text } from "metabase/ui";
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
    <ConfirmModal
      opened={opened}
      title={
        <Text size="lg" style={{ wordBreak: "break-all" }}>
          {title}
        </Text>
      }
      content={t`This may impact the models and questions that use the table(s) as their data source. This can't be undone.`}
      message={
        <Box mb="lg">
          <Switch
            size="sm"
            checked={sendToTrash}
            label={ngettext(
              msgid`Also send all models and questions based on this table to the trash`,
              `Also send all models and questions based on these tables to the trash`,
              tables.length,
            )}
            onChange={(e) => setSendToTrash(e.target.checked)}
          />
        </Box>
      }
      confirmButtonText={t`Delete`}
      onConfirm={() => onConfirm(sendToTrash)}
      onClose={onClose}
    />
  );
}
