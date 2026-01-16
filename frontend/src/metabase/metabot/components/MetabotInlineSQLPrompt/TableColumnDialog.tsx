import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "metabase/ui";
import type { ColumnReference, TableReference } from "metabase-types/api";

export interface TableColumnDialogProps {
  table: TableReference;
  enabledColumns: Set<number> | null; // null = all enabled
  onToggleColumn: (columnId: number) => void;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onClose: () => void;
  // Column context editing
  getColumnContext: (columnId: number) => string | null;
  isColumnContextEdited: (columnId: number) => boolean;
  onUpdateColumnContext: (columnId: number, context: string) => void;
  onResetColumnContext: (columnId: number) => void;
  // Table context editing
  tableContext: string | null;
  isTableContextEdited: boolean;
  onUpdateTableContext: (context: string) => void;
  onResetTableContext: () => void;
}

export function TableColumnDialog({
  table,
  enabledColumns,
  onToggleColumn,
  onEnableAll,
  onDisableAll,
  onClose,
  getColumnContext,
  isColumnContextEdited,
  onUpdateColumnContext,
  onResetColumnContext,
  tableContext,
  isTableContextEdited,
  onUpdateTableContext,
  onResetTableContext,
}: TableColumnDialogProps) {
  const columns = table.columns ?? [];
  const allEnabled = enabledColumns === null;
  const enabledCount = allEnabled ? columns.length : enabledColumns.size;

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        table.schema
          ? `${table.schema}.${table.name}`
          : (table.display_name ?? table.name)
      }
      size="lg"
    >
      <Stack gap="md">
        {/* Table description field */}
        <Box>
          <Group gap="xs" mb={4}>
            <Text size="sm" c="text-tertiary">
              {t`Table description for AI`}
            </Text>
            {isTableContextEdited && (
              <Tooltip label={t`Reset to original`}>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  onClick={onResetTableContext}
                  aria-label={t`Reset table description`}
                >
                  <Icon name="revert" size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          <Textarea
            size="sm"
            placeholder={t`Table description...`}
            value={tableContext ?? ""}
            onChange={(e) => onUpdateTableContext(e.currentTarget.value)}
            autosize
            minRows={1}
            maxRows={3}
            styles={{
              input: {
                fontSize: "var(--mantine-font-size-sm)",
              },
            }}
          />
        </Box>

        <Group justify="space-between">
          <Text size="sm" c="text-secondary">
            {t`${enabledCount} of ${columns.length} columns enabled`}
          </Text>
          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={onEnableAll}>
              {t`Enable all`}
            </Button>
            <Button variant="subtle" size="xs" onClick={onDisableAll}>
              {t`Disable all`}
            </Button>
          </Group>
        </Group>

        <Stack gap="sm">
          {columns.map((column) => {
            const isEnabled = allEnabled || enabledColumns.has(column.id);
            const context = getColumnContext(column.id);
            const isEdited = isColumnContextEdited(column.id);
            return (
              <ColumnRow
                key={column.id}
                column={column}
                enabled={isEnabled}
                onToggle={() => onToggleColumn(column.id)}
                context={context}
                isContextEdited={isEdited}
                onUpdateContext={(ctx: string) =>
                  onUpdateColumnContext(column.id, ctx)
                }
                onResetContext={() => onResetColumnContext(column.id)}
              />
            );
          })}
        </Stack>
      </Stack>
    </Modal>
  );
}

interface ColumnRowProps {
  column: ColumnReference;
  enabled: boolean;
  onToggle: () => void;
  context: string | null;
  isContextEdited: boolean;
  onUpdateContext: (context: string) => void;
  onResetContext: () => void;
}

function ColumnRow({
  column,
  enabled,
  onToggle,
  context,
  isContextEdited,
  onUpdateContext,
  onResetContext,
}: ColumnRowProps) {
  return (
    <Box
      p="sm"
      style={{
        borderRadius: "var(--mantine-radius-sm)",
        backgroundColor: "var(--mantine-color-bg-light)",
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <Flex justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label={enabled ? t`Hide column` : t`Show column`}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={onToggle}
                aria-label={enabled ? t`Hide column` : t`Show column`}
              >
                <Icon name={enabled ? "eye" : "eye_crossed_out"} />
              </ActionIcon>
            </Tooltip>
            <Text size="sm" fw={500} c={enabled ? undefined : "text-tertiary"}>
              {column.name}
            </Text>
            {column.database_type && (
              <Badge size="sm" variant="light">
                {column.database_type}
              </Badge>
            )}
          </Group>
          {column.description && (
            <Text size="sm" c="text-secondary" ml={36}>
              {column.description}
            </Text>
          )}
          {column.fk_target && (
            <Text size="sm" c="text-secondary" ml={36}>
              {t`FK → ${column.fk_target.table_name}.${column.fk_target.field_name}`}
            </Text>
          )}
        </Box>
      </Flex>

      {/* Context field for LLM */}
      <Box mt="xs" ml={36}>
        <Group gap="xs" mb={4}>
          <Text size="sm" c="text-tertiary">
            {t`Context for AI`}
          </Text>
          {isContextEdited && enabled && (
            <Tooltip label={t`Reset to auto-generated`}>
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={onResetContext}
                aria-label={t`Reset context`}
              >
                <Icon name="revert" size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <Textarea
          size="sm"
          placeholder={t`Auto-generated metadata about this column...`}
          value={context ?? ""}
          onChange={(e) => onUpdateContext(e.currentTarget.value)}
          disabled={!enabled}
          autosize
          minRows={1}
          maxRows={3}
          styles={{
            input: {
              fontSize: "var(--mantine-font-size-sm)",
              fontFamily: "monospace",
            },
          }}
        />
      </Box>
    </Box>
  );
}
