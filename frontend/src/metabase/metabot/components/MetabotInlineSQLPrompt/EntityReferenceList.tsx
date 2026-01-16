import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Flex,
  Icon,
  Popover,
  Text,
  Tooltip,
} from "metabase/ui";
import type { ConcreteTableId, TableReference } from "metabase-types/api";

import S from "./EntityReferenceList.module.css";

interface EntityReferenceListProps {
  tables: TableReference[];
  onRemove: (tableId: ConcreteTableId) => void;
  onTableClick?: (table: TableReference) => void;
  getEnabledColumnCount?: (
    tableId: number,
  ) => { enabled: number; total: number } | null;
  maxVisible?: number;
}

export function EntityReferenceList({
  tables,
  onRemove,
  onTableClick,
  getEnabledColumnCount,
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
        <TableChip
          key={table.id}
          table={table}
          onRemove={onRemove}
          onClick={onTableClick}
          columnCount={getEnabledColumnCount?.(table.id)}
        />
      ))}
      {hasOverflow && (
        <OverflowChip
          tables={overflowTables}
          onRemove={onRemove}
          onClick={onTableClick}
          getEnabledColumnCount={getEnabledColumnCount}
        />
      )}
    </Flex>
  );
}

interface TableChipProps {
  table: TableReference;
  onRemove: (tableId: ConcreteTableId) => void;
  onClick?: (table: TableReference) => void;
  columnCount?: { enabled: number; total: number } | null;
}

function TableChip({ table, onRemove, onClick, columnCount }: TableChipProps) {
  const displayName = table.display_name || table.name;
  const fullName = table.schema ? `${table.schema}.${table.name}` : table.name;
  const hasFilteredColumns =
    columnCount && columnCount.enabled < columnCount.total;
  const isClickable = onClick && table.columns && table.columns.length > 0;

  const handleClick = () => {
    if (isClickable) {
      onClick(table);
    }
  };

  return (
    <Tooltip label={fullName} disabled={displayName === fullName}>
      <Flex
        align="center"
        className={S.chip}
        onClick={handleClick}
        style={isClickable ? { cursor: "pointer" } : undefined}
      >
        <Icon name="table" size={12} c="text-secondary" />
        <Text size="xs" className={S.chipText}>
          {displayName}
        </Text>
        {hasFilteredColumns && (
          <Badge size="xs" variant="light" ml={4}>
            {columnCount.enabled}/{columnCount.total}
          </Badge>
        )}
        <ActionIcon
          size="xs"
          variant="transparent"
          className={S.removeButton}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(table.id);
          }}
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
  onClick?: (table: TableReference) => void;
  getEnabledColumnCount?: (
    tableId: number,
  ) => { enabled: number; total: number } | null;
}

function OverflowChip({
  tables,
  onRemove,
  onClick,
  getEnabledColumnCount,
}: OverflowChipProps) {
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
            <TableChip
              key={table.id}
              table={table}
              onRemove={onRemove}
              onClick={onClick}
              columnCount={getEnabledColumnCount?.(table.id)}
            />
          ))}
        </Flex>
      </Popover.Dropdown>
    </Popover>
  );
}
