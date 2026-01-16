import { useCallback, useState } from "react";
import { t } from "ttag";

import { useGenerateDescriptionsMutation } from "metabase/api";
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
import type {
  ColumnReference,
  DatabaseId,
  FieldId,
  TableReference,
} from "metabase-types/api";

export interface TableColumnDialogProps {
  table: TableReference;
  databaseId: DatabaseId | null;
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
  // Save to database functionality (optional)
  onSaveTableDescription?: (description: string) => Promise<void>;
  onSaveColumnDescriptions?: (
    descriptions: Record<FieldId, string>,
  ) => Promise<void>;
}

export function TableColumnDialog({
  table,
  databaseId,
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
  onSaveTableDescription,
  onSaveColumnDescriptions,
}: TableColumnDialogProps) {
  const columns = table.columns ?? [];
  const allEnabled = enabledColumns === null;
  const enabledCount = allEnabled ? columns.length : enabledColumns.size;

  const [generateDescriptions, { isLoading: isGenerating }] =
    useGenerateDescriptionsMutation();
  const [generatingColumnIds, setGeneratingColumnIds] = useState<Set<FieldId>>(
    new Set(),
  );
  const [savingTableDescription, setSavingTableDescription] = useState(false);
  const [savedTableDescription, setSavedTableDescription] = useState(false);
  const [savingColumnIds, setSavingColumnIds] = useState<Set<FieldId>>(
    new Set(),
  );
  const [savedColumnIds, setSavedColumnIds] = useState<Set<FieldId>>(new Set());

  const handleSaveTableDescription = useCallback(async () => {
    if (!onSaveTableDescription || !isTableContextEdited || !tableContext) {
      return;
    }
    setSavingTableDescription(true);
    try {
      await onSaveTableDescription(tableContext);
      setSavedTableDescription(true);
    } finally {
      setSavingTableDescription(false);
    }
  }, [onSaveTableDescription, isTableContextEdited, tableContext]);

  const handleSaveColumnDescription = useCallback(
    async (columnId: FieldId) => {
      if (!onSaveColumnDescriptions || !isColumnContextEdited(columnId)) {
        return;
      }
      const context = getColumnContext(columnId);
      if (!context) {
        return;
      }
      setSavingColumnIds((prev) => new Set(prev).add(columnId));
      try {
        await onSaveColumnDescriptions({ [columnId]: context });
        setSavedColumnIds((prev) => new Set(prev).add(columnId));
      } finally {
        setSavingColumnIds((prev) => {
          const next = new Set(prev);
          next.delete(columnId);
          return next;
        });
      }
    },
    [onSaveColumnDescriptions, isColumnContextEdited, getColumnContext],
  );

  const handleTableContextChange = useCallback(
    (value: string) => {
      setSavedTableDescription(false);
      onUpdateTableContext(value);
    },
    [onUpdateTableContext],
  );

  const handleColumnContextChange = useCallback(
    (columnId: FieldId, value: string) => {
      setSavedColumnIds((prev) => {
        const next = new Set(prev);
        next.delete(columnId);
        return next;
      });
      onUpdateColumnContext(columnId, value);
    },
    [onUpdateColumnContext],
  );

  const handleGenerateAll = useCallback(async () => {
    if (!databaseId) {
      return;
    }
    try {
      const result = await generateDescriptions({
        database_id: databaseId,
        table_id: table.id,
        include_table: true,
      }).unwrap();

      if (result.table_description) {
        onUpdateTableContext(result.table_description);
      }
      for (const [colIdStr, description] of Object.entries(
        result.column_descriptions,
      )) {
        const colId = Number(colIdStr);
        onUpdateColumnContext(colId, description);
      }
    } catch {
      // Error handled by RTK Query
    }
  }, [
    databaseId,
    table.id,
    generateDescriptions,
    onUpdateTableContext,
    onUpdateColumnContext,
  ]);

  const handleGenerateTableDescription = useCallback(async () => {
    if (!databaseId) {
      return;
    }
    try {
      const result = await generateDescriptions({
        database_id: databaseId,
        table_id: table.id,
        column_ids: [],
        include_table: true,
      }).unwrap();

      if (result.table_description) {
        onUpdateTableContext(result.table_description);
      }
    } catch {
      // Error handled by RTK Query
    }
  }, [databaseId, table.id, generateDescriptions, onUpdateTableContext]);

  const handleGenerateColumnDescription = useCallback(
    async (columnId: FieldId) => {
      if (!databaseId) {
        return;
      }
      setGeneratingColumnIds((prev) => new Set(prev).add(columnId));
      try {
        const result = await generateDescriptions({
          database_id: databaseId,
          table_id: table.id,
          column_ids: [columnId],
          include_table: false,
        }).unwrap();

        const description = result.column_descriptions[columnId];
        if (description) {
          onUpdateColumnContext(columnId, description);
        }
      } catch {
        // Error handled by RTK Query
      } finally {
        setGeneratingColumnIds((prev) => {
          const next = new Set(prev);
          next.delete(columnId);
          return next;
        });
      }
    },
    [databaseId, table.id, generateDescriptions, onUpdateColumnContext],
  );

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
          <Group gap="xs" mb={4} justify="space-between">
            <Group gap="xs">
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
            <Group gap={4}>
              {databaseId && (
                <Tooltip label={t`Generate description with AI`}>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={handleGenerateTableDescription}
                    disabled={isGenerating}
                    aria-label={t`Generate table description`}
                  >
                    <Icon name="insight" size={10} />
                  </ActionIcon>
                </Tooltip>
              )}
              {onSaveTableDescription && isTableContextEdited && (
                <Tooltip
                  label={
                    savedTableDescription
                      ? t`Saved to database`
                      : t`Save to database`
                  }
                >
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={handleSaveTableDescription}
                    disabled={savingTableDescription || savedTableDescription}
                    aria-label={t`Save table description`}
                    c={savedTableDescription ? "success" : undefined}
                  >
                    <Icon
                      name={savedTableDescription ? "check" : "arrow_up"}
                      size={10}
                    />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
          <Textarea
            size="sm"
            placeholder={t`Table description...`}
            value={tableContext ?? ""}
            onChange={(e) => handleTableContextChange(e.currentTarget.value)}
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
            {databaseId && (
              <Button
                variant="subtle"
                size="xs"
                onClick={handleGenerateAll}
                disabled={isGenerating}
                leftSection={<Icon name="insight" size={12} />}
              >
                {t`Generate all`}
              </Button>
            )}
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
            const isColumnGenerating = generatingColumnIds.has(column.id);
            const isColumnSaving = savingColumnIds.has(column.id);
            const isColumnSaved = savedColumnIds.has(column.id);
            return (
              <ColumnRow
                key={column.id}
                column={column}
                enabled={isEnabled}
                onToggle={() => onToggleColumn(column.id)}
                context={context}
                isContextEdited={isEdited}
                onUpdateContext={(ctx: string) =>
                  handleColumnContextChange(column.id, ctx)
                }
                onResetContext={() => onResetColumnContext(column.id)}
                canGenerate={databaseId !== null}
                isGenerating={isColumnGenerating}
                onGenerate={() => handleGenerateColumnDescription(column.id)}
                canSave={onSaveColumnDescriptions !== undefined}
                isSaving={isColumnSaving}
                isSaved={isColumnSaved}
                onSave={() => handleSaveColumnDescription(column.id)}
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
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  canSave: boolean;
  isSaving: boolean;
  isSaved: boolean;
  onSave: () => void;
}

function ColumnRow({
  column,
  enabled,
  onToggle,
  context,
  isContextEdited,
  onUpdateContext,
  onResetContext,
  canGenerate,
  isGenerating,
  onGenerate,
  canSave,
  isSaving,
  isSaved,
  onSave,
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
          {column.fk_target && (
            <Text size="sm" c="text-secondary" ml={36}>
              {t`FK → ${column.fk_target.table_name}.${column.fk_target.field_name}`}
            </Text>
          )}
        </Box>
      </Flex>

      {/* Description field for LLM (editable) */}
      <Box mt="xs" ml={36}>
        <Group gap="xs" mb={4} justify="space-between">
          <Group gap="xs">
            <Text size="sm" c="text-tertiary">
              {t`Description`}
            </Text>
            {isContextEdited && enabled && (
              <Tooltip label={t`Reset to original`}>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  onClick={onResetContext}
                  aria-label={t`Reset description`}
                >
                  <Icon name="revert" size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          <Group gap={4}>
            {canGenerate && enabled && (
              <Tooltip label={t`Generate description with AI`}>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  onClick={onGenerate}
                  disabled={isGenerating}
                  aria-label={t`Generate column description`}
                >
                  <Icon name="insight" size={10} />
                </ActionIcon>
              </Tooltip>
            )}
            {canSave && isContextEdited && enabled && (
              <Tooltip
                label={isSaved ? t`Saved to database` : t`Save to database`}
              >
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  onClick={onSave}
                  disabled={isSaving || isSaved}
                  aria-label={t`Save column description`}
                  c={isSaved ? "success" : undefined}
                >
                  <Icon name={isSaved ? "check" : "arrow_up"} size={10} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
        <Textarea
          size="sm"
          placeholder={t`Describe what this column contains...`}
          value={context ?? ""}
          onChange={(e) => onUpdateContext(e.currentTarget.value)}
          disabled={!enabled}
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

      {/* Metadata field (read-only, auto-generated) */}
      {column.metadata && (
        <Box mt="xs" ml={36}>
          <Text size="sm" c="text-tertiary" mb={4}>
            {t`Auto-generated metadata`}
          </Text>
          <Text
            size="sm"
            c="text-secondary"
            style={{
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {column.metadata}
          </Text>
        </Box>
      )}
    </Box>
  );
}
