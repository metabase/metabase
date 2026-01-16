import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

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

interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  onClose: () => void;
  isLoading: boolean;
  error: string | undefined;
  generate: (
    value: string,
    sourceSql?: string,
    tableIds?: number[],
  ) => Promise<void>;
  cancelRequest: () => void;
  suggestionModels: SuggestionModel[];
  getSourceSql?: () => string;
  pinnedTables: TableReference[];
  onAddTable: (table: TableReference) => void;
  onRemoveTable: (tableId: ConcreteTableId) => void;
  onRefreshTables: (sql: string) => Promise<void>;
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
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");

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
        });
      }
    },
    [onAddTable],
  );

  const handleSubmit = useCallback(async () => {
    const prompt = inputRef.current?.getValue?.().trim() ?? "";
    const sourceSql = getSourceSql?.();
    const tableIds = pinnedTables.map((t) => t.id);
    generate(prompt, sourceSql, tableIds.length > 0 ? tableIds : undefined);
  }, [generate, getSourceSql, pinnedTables]);

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
    <Box className={S.container} data-testid="metabot-inline-sql-prompt">
      {pinnedTables.length > 0 && (
        <EntityReferenceList tables={pinnedTables} onRemove={onRemoveTable} />
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
            searchOptions: databaseId ? { table_db_id: databaseId } : undefined,
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
          <Box data-testid="metabot-inline-sql-error" fz="sm" c="error" ml="sm">
            {error}
          </Box>
        )}
      </Flex>
    </Box>
  );
};
