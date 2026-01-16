import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { useUpdateFieldMutation, useUpdateTableMutation } from "metabase/api";
import type { MetabotPromptInputRef } from "metabase/metabot";
import {
  type MentionSelectedPayload,
  MetabotPromptInput,
} from "metabase/metabot/components/MetabotPromptInput";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type {
  ConcreteTableId,
  DatabaseId,
  TableReference,
} from "metabase-types/api";

import { EntityReferenceList } from "./EntityReferenceList";
import S from "./MetabotInlineSQLPrompt.module.css";
import { TableColumnDialog } from "./TableColumnDialog";

// Column filter state type: table_id -> Set of enabled column IDs
// null/undefined = all columns enabled
type ColumnFilterState = Record<number, Set<number> | null>;

export interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  onClose: () => void;
  isLoading: boolean;
  error: string | undefined;
  generate: (
    value: string,
    sourceSql?: string,
    tableIds?: number[],
    columnFilters?: Record<number, number[]>,
    columnContexts?: Record<number, Record<number, string>>,
    tableContexts?: Record<number, string>,
  ) => Promise<void>;
  cancelRequest: () => void;
  suggestionModels: SuggestionModel[];
  getSourceSql?: () => string;
  pinnedTables: TableReference[];
  onAddTable: (table: TableReference) => void;
  onRemoveTable: (tableId: ConcreteTableId) => void;
  onRefreshTables: (sql: string) => Promise<void>;
  columnFilters: ColumnFilterState;
  onToggleColumn: (tableId: number, columnId: number) => void;
  onSetAllColumns: (tableId: number, enabled: boolean) => void;
  getEnabledColumnCount: (
    tableId: number,
  ) => { enabled: number; total: number } | null;
  buildColumnFiltersForRequest: () => Record<number, number[]> | undefined;
  // Column context editing
  getColumnContext: (columnId: number) => string | null;
  isColumnContextEdited: (columnId: number) => boolean;
  onUpdateColumnContext: (columnId: number, context: string) => void;
  onResetColumnContext: (columnId: number) => void;
  buildColumnContextsForRequest: () =>
    | Record<number, Record<number, string>>
    | undefined;
  // Table context editing
  getTableContext: (tableId: number) => string | null;
  isTableContextEdited: (tableId: number) => boolean;
  onUpdateTableContext: (tableId: number, context: string) => void;
  onResetTableContext: (tableId: number) => void;
  buildTableContextsForRequest: () => Record<number, string> | undefined;
}

export const MetabotInlineSQLPrompt = ({
  databaseId,
  onClose,
  isLoading,
  error,
  generate,
  cancelRequest,
  suggestionModels,
  getSourceSql,
  pinnedTables,
  onAddTable,
  onRemoveTable,
  onRefreshTables,
  columnFilters,
  onToggleColumn,
  onSetAllColumns,
  getEnabledColumnCount,
  buildColumnFiltersForRequest,
  getColumnContext,
  isColumnContextEdited,
  onUpdateColumnContext,
  onResetColumnContext,
  buildColumnContextsForRequest,
  getTableContext,
  isTableContextEdited,
  onUpdateTableContext,
  onResetTableContext,
  buildTableContextsForRequest,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const [selectedTable, setSelectedTable] = useState<TableReference | null>(
    null,
  );
  const [updateTable] = useUpdateTableMutation();
  const [updateField] = useUpdateFieldMutation();

  const handleSaveTableDescription = useCallback(
    async (description: string | null) => {
      if (!selectedTable) {
        return;
      }
      await updateTable({ id: selectedTable.id, description }).unwrap();
    },
    [selectedTable, updateTable],
  );

  const handleSaveColumnDescriptions = useCallback(
    async (descriptions: Record<number, string | null>) => {
      const promises = Object.entries(descriptions).map(
        ([fieldId, description]) =>
          updateField({ id: Number(fieldId), description }).unwrap(),
      );
      await Promise.all(promises);
    },
    [updateField],
  );

  // Refresh tables when prompt opens (catches any SQL changes since last extraction)
  useEffect(() => {
    if (getSourceSql) {
      const sql = getSourceSql();
      if (sql.trim()) {
        onRefreshTables(sql);
      }
    }
  }, [getSourceSql, onRefreshTables]);

  const disabled = !value.trim() || isLoading;

  const handleMentionSelected = useCallback(
    (mention: MentionSelectedPayload) => {
      // Only add table mentions to pinned tables
      if (mention.model === "table" && typeof mention.id === "number") {
        onAddTable({
          id: mention.id,
          name: mention.label ?? `Table ${mention.id}`,
          display_name: mention.label,
          schema: mention.schema,
        });
      }
    },
    [onAddTable],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = inputRef.current?.getValue?.().trim() ?? "";
    const sourceSql = getSourceSql?.();
    const tableIds = pinnedTables.map((t) => t.id);
    const columnFiltersForRequest = buildColumnFiltersForRequest();
    const columnContextsForRequest = buildColumnContextsForRequest();
    const tableContextsForRequest = buildTableContextsForRequest();
    generate(
      prompt,
      sourceSql,
      tableIds.length > 0 ? tableIds : undefined,
      columnFiltersForRequest,
      columnContextsForRequest,
      tableContextsForRequest,
    );
  }, [
    generate,
    getSourceSql,
    pinnedTables,
    buildColumnFiltersForRequest,
    buildColumnContextsForRequest,
    buildTableContextsForRequest,
  ]);

  const handleClose = useCallback(() => {
    cancelRequest();
    onClose();
  }, [cancelRequest, onClose]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (e) => {
          if (!disabled) {
            e.preventDefault();
            handleSubmit();
          }
        },
        "$mod+Shift+i": (e) => {
          e.preventDefault();
          handleClose();
        },
      },
      { capture: true },
    );
  }, [disabled, handleSubmit, handleClose]);

  return (
    <>
      <Box className={S.container} data-testid="metabot-inline-sql-prompt">
        {pinnedTables.length > 0 && (
          <EntityReferenceList
            tables={pinnedTables}
            onRemove={onRemoveTable}
            onTableClick={setSelectedTable}
            getEnabledColumnCount={getEnabledColumnCount}
          />
        )}
        <Box className={S.inputContainer}>
          <MetabotPromptInput
            ref={inputRef}
            value={value}
            placeholder={t`Describe what SQL you want...`}
            autoFocus
            disabled={isLoading}
            onChange={setValue}
            onStop={handleClose}
            suggestionConfig={{
              suggestionModels,
              searchOptions: databaseId
                ? { table_db_id: databaseId }
                : undefined,
            }}
            onMentionSelected={handleMentionSelected}
          />
        </Box>
        <Flex justify="flex-start" align="center" gap="xs" mt="xs">
          <Button
            data-testid="metabot-inline-sql-generate"
            size="xs"
            px="sm"
            variant="filled"
            onClick={handleSubmit}
            disabled={disabled}
            leftSection={
              isLoading ? (
                <Loader size="xs" color="text-tertiary" />
              ) : (
                <Icon name="insight" />
              )
            }
          >
            {isLoading ? t`Generating...` : t`Generate`}
          </Button>
          <Button
            data-testid="metabot-inline-sql-cancel"
            size="xs"
            variant="subtle"
            onClick={handleClose}
          >
            {t`Cancel`}
          </Button>
          {error && (
            <Box
              data-testid="metabot-inline-sql-error"
              fz="sm"
              c="error"
              ml="sm"
            >
              {error}
            </Box>
          )}
        </Flex>
      </Box>

      {selectedTable && (
        <TableColumnDialog
          table={selectedTable}
          databaseId={databaseId}
          enabledColumns={columnFilters[selectedTable.id] ?? null}
          onToggleColumn={(columnId: number) =>
            onToggleColumn(selectedTable.id, columnId)
          }
          onEnableAll={() => onSetAllColumns(selectedTable.id, true)}
          onDisableAll={() => onSetAllColumns(selectedTable.id, false)}
          onClose={() => setSelectedTable(null)}
          getColumnContext={getColumnContext}
          isColumnContextEdited={isColumnContextEdited}
          onUpdateColumnContext={onUpdateColumnContext}
          onResetColumnContext={onResetColumnContext}
          tableContext={getTableContext(selectedTable.id)}
          isTableContextEdited={isTableContextEdited(selectedTable.id)}
          onUpdateTableContext={(context: string) =>
            onUpdateTableContext(selectedTable.id, context)
          }
          onResetTableContext={() => onResetTableContext(selectedTable.id)}
          onSaveTableDescription={handleSaveTableDescription}
          onSaveColumnDescriptions={handleSaveColumnDescriptions}
        />
      )}
    </>
  );
};
