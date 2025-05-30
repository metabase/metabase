import { msgid, ngettext, t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";

type ForeignKeyError = {
  index: number;
  error: string;
  type: "metabase.actions.error/violate-foreign-key-constraint";
  message: string;
  errors: Record<string, unknown>;
  "status-code": number;
  children: Record<string, number>; // table id to row count mapping
};

type CascadeDeleteConfirmationModalProps = {
  opened: boolean;
  rowCount: number;
  foreignKeyError: ForeignKeyError;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

// Helper component to display table name or ID
function TableDisplayName({ tableId }: { tableId: string }) {
  const { data: table } = useGetTableQuery(
    { id: parseInt(tableId, 10) },
    {
      skip: !tableId || isNaN(parseInt(tableId, 10)),
    },
  );

  return <>{table?.display_name || table?.name || `Table ${tableId}`}</>;
}

export function CascadeDeleteConfirmationModal({
  opened,
  rowCount,
  foreignKeyError,
  isLoading,
  onConfirm,
  onClose,
}: CascadeDeleteConfirmationModalProps) {
  const childrenInfo = Object.entries(foreignKeyError.children || {});
  const totalChildrenRows = childrenInfo.reduce(
    (sum, [, count]) => sum + count,
    0,
  );

  return (
    <Modal
      size="md"
      title={t`Foreign Key Constraint Violation`}
      opened={opened}
      onClose={onClose}
    >
      <Stack gap="md">
        <Text>
          {foreignKeyError.message ||
            t`Other tables rely on this row so it cannot be deleted.`}
        </Text>

        {childrenInfo.length > 0 && (
          <Stack gap="xs">
            <Text fw={500}>{t`Dependent rows in other tables:`}</Text>
            {childrenInfo.map(([tableId, count]) => (
              <Text key={tableId} size="sm" c="text-medium">
                • <TableDisplayName tableId={tableId} />:{" "}
                {ngettext(msgid`${count} row`, `${count} rows`, count)}
              </Text>
            ))}
            <Text size="sm" fw={500} c="text-medium">
              {ngettext(
                msgid`Total: ${totalChildrenRows} dependent row`,
                `Total: ${totalChildrenRows} dependent rows`,
                totalChildrenRows,
              )}
            </Text>
          </Stack>
        )}

        <Text>
          {ngettext(
            msgid`Do you want to cascade delete the selected row and all its dependent rows?`,
            `Do you want to cascade delete the selected ${rowCount} rows and all their dependent rows?`,
            rowCount,
          )}
        </Text>
      </Stack>

      <Group justify="flex-end" mt="xl">
        <Button variant="subtle" onClick={onClose}>
          {t`Cancel`}
        </Button>
        <Button
          variant="filled"
          color="danger"
          onClick={onConfirm}
          loading={isLoading}
        >
          {ngettext(
            msgid`Cascade Delete ${rowCount} Record`,
            `Cascade Delete ${rowCount} Records`,
            rowCount,
          )}
        </Button>
      </Group>
    </Modal>
  );
}
