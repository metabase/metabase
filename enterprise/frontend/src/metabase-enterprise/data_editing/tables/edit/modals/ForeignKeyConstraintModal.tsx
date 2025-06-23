import { useMemo } from "react";
import { t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Flex, Icon, Stack, Text } from "metabase/ui";

export interface ForeignKeyConstraintModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  childRecords: Record<string, number>;
  message?: string;
}

interface TableRowProps {
  tableId: string;
  count: number;
}

const TableRow = ({ tableId, count = 0 }: TableRowProps) => {
  const { data: table } = useGetTableQuery({ id: parseInt(tableId, 10) });

  const tableName = table?.display_name || t`Table ${tableId}`;
  const countText = count > 50 ? "50+" : count.toString();
  // for some reason ngettext throws an error here.
  // const recordsText = ngettext(msgid`record`, "records", count);
  const recordsText = count === 1 ? t`record` : t`records`;

  return (
    <Flex align="center" gap="sm">
      <Text fw="bold">{`${countText} ${recordsText}`}</Text>
      <Text c="text-medium">{t`in`}</Text>
      <Flex align="center" gap="xs">
        <Icon name="table" size={16} color="var(--mb-color-brand)" />
        <Text fw="500">{tableName}</Text>
      </Flex>
    </Flex>
  );
};

export const ForeignKeyConstraintModal = ({
  opened,
  onClose,
  onConfirm,
  isLoading = false,
  childRecords,
  message,
}: ForeignKeyConstraintModalProps) => {
  const childRecordsInfo = useMemo(() => {
    return childRecords
      ? Object.entries(childRecords).map(([tableId, count]) => ({
          tableId,
          count,
        }))
      : [];
  }, [childRecords]);

  return (
    <ConfirmModal
      opened={opened}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t`Delete this and all linked records?`}
      message={
        <Stack gap="lg">
          <Text>
            {message ||
              t`This record is linked to other records in connected tables. Deleting it will also delete them. This action can't be undone! Here's what will be deleted:`}
          </Text>

          <Stack gap="md" ml="0">
            {childRecordsInfo.map(({ tableId, count }) => (
              <TableRow key={tableId} tableId={tableId} count={count} />
            ))}
          </Stack>
        </Stack>
      }
      confirmButtonText={t`Delete this and linked records`}
      confirmButtonProps={{
        color: "danger",
        variant: "filled",
        loading: isLoading,
      }}
      size="md"
    />
  );
};
