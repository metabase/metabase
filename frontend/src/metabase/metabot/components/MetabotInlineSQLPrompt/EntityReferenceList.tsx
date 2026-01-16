import { t } from "ttag";

import { ActionIcon, Flex, Icon, Popover, Text, Tooltip } from "metabase/ui";
import type { ConcreteTableId, TableReference } from "metabase-types/api";

import S from "./EntityReferenceList.module.css";

interface EntityReferenceListProps {
  tables: TableReference[];
  onRemove: (tableId: ConcreteTableId) => void;
  maxVisible?: number;
}

export function EntityReferenceList({
  tables,
  onRemove,
  maxVisible = 5,
}: EntityReferenceListProps) {
  if (tables.length === 0) {
    return null;
  }

  const visibleTables = tables.slice(0, maxVisible);
  const overflowTables = tables.slice(maxVisible);
  const hasOverflow = overflowTables.length > 0;

  return (
    <Flex gap="xs" wrap="wrap" className={S.container}>
      {visibleTables.map((table) => (
        <TableChip key={table.id} table={table} onRemove={onRemove} />
      ))}
      {hasOverflow && (
        <OverflowChip tables={overflowTables} onRemove={onRemove} />
      )}
    </Flex>
  );
}

interface TableChipProps {
  table: TableReference;
  onRemove: (tableId: ConcreteTableId) => void;
}

function TableChip({ table, onRemove }: TableChipProps) {
  const displayName = table.display_name || table.name;
  const fullName = table.schema ? `${table.schema}.${table.name}` : table.name;

  return (
    <Tooltip label={fullName} disabled={displayName === fullName}>
      <Flex align="center" className={S.chip}>
        <Icon name="table" size={12} c="text-secondary" />
        <Text size="xs" className={S.chipText}>
          {displayName}
        </Text>
        <ActionIcon
          size="xs"
          variant="transparent"
          className={S.removeButton}
          onClick={() => onRemove(table.id)}
          aria-label={t`Remove ${displayName}`}
        >
          <span className={S.removeIcon}>×</span>
        </ActionIcon>
      </Flex>
    </Tooltip>
  );
}

interface OverflowChipProps {
  tables: TableReference[];
  onRemove: (tableId: ConcreteTableId) => void;
}

function OverflowChip({ tables, onRemove }: OverflowChipProps) {
  return (
    <Popover position="bottom-start" shadow="md">
      <Popover.Target>
        <Flex align="center" className={S.overflowChip}>
          <Text size="xs" className={S.chipText}>
            +{tables.length} {t`more`}
          </Text>
        </Flex>
      </Popover.Target>
      <Popover.Dropdown className={S.dropdown}>
        <Flex direction="column" gap="xs">
          {tables.map((table) => (
            <TableChip key={table.id} table={table} onRemove={onRemove} />
          ))}
        </Flex>
      </Popover.Dropdown>
    </Popover>
  );
}
