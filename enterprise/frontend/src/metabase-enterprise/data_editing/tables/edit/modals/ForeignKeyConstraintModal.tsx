import { t } from "ttag";

import { useGetTableQuery } from "metabase/api";
import { ConfirmModal } from "metabase/components/ConfirmModal";
import { Icon, Stack, Text, Flex } from "metabase/ui";

export interface ForeignKeyConstraintModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  children: Record<string, number>;
  message?: string;
}

interface TableRowProps {
  tableId: string;
  count: number;
}

const TableRow = ({ tableId, count }: TableRowProps) => {
  const { data: table } = useGetTableQuery({ id: parseInt(tableId, 10) });
  
  const displayCount = count > 50 ? "50+" : count.toString();
  const recordText = count === 1 ? "record" : "records";
  const tableName = table?.display_name || `Table ${tableId}`;

  return (
    <Flex align="center" gap="sm">
      <Text fw="bold">{displayCount} {recordText}</Text>
      <Text c="text-medium">in</Text>
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
  children,
  message,
}: ForeignKeyConstraintModalProps) => {
  const childrenInfo = Object.entries(children).map(([tableId, count]) => ({
    tableId,
    count,
  }));

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
              t`This record is linked to other records in connected tables. Deleting it will also delete them. This action can't be undone! Here's what will be deleted:`
            }
          </Text>
          
          <Stack gap="md" ml="0">
            {childrenInfo.map(({ tableId, count }) => (
              <TableRow key={tableId} tableId={tableId} count={count} />
            ))}
          </Stack>
        </Stack>
      }
      confirmButtonText={t`Delete this and linked records`}
      closeButtonText={t`Cancel`}
      confirmButtonProps={{ 
        color: "danger", 
        variant: "filled",
        loading: isLoading
      }}
      size="md"
    />
  );
}; 
