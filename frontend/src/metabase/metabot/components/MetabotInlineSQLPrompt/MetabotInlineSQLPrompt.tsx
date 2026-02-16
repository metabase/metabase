import { useCallback, useEffect, useRef } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Button, Flex, Icon, Loader, Tooltip } from "metabase/ui";
import type { DatabaseId, ReferencedEntityId } from "metabase-types/api";

import S from "./MetabotInlineSQLPrompt.module.css";
import { type SelectedTable, TablePillsInput } from "./TablePillsInput";

interface MetabotInlineSQLPromptProps {
  isTableBarEnabled: boolean;
  databaseId: DatabaseId | null;
  onClose: () => void;
  isLoading: boolean;
  error: string | undefined;
  generate: (options: {
    prompt: string;
    sourceSql?: string;
    referencedEntities?: ReferencedEntityId[];
  }) => Promise<void>;
  cancelRequest: () => void;
  suggestionModels: SuggestionModel[];
  getSourceSql?: () => string;
  value: string;
  onValueChange: (value: string) => void;
  selectedTables: SelectedTable[];
  onSelectedTablesChange: (tables: SelectedTable[]) => void;
}

export const MetabotInlineSQLPrompt = ({
  isTableBarEnabled,
  databaseId,
  onClose,
  isLoading,
  error,
  generate,
  cancelRequest,
  suggestionModels,
  getSourceSql,
  value,
  onValueChange,
  selectedTables,
  onSelectedTablesChange,
}: MetabotInlineSQLPromptProps) => {
  const promptInputRef = useRef<MetabotPromptInputRef>(null);

  const isSubmitDisabled = !value.trim() || isLoading;

  const handleSubmit = useCallback(async () => {
    const prompt = promptInputRef.current?.getValue?.().trim() ?? "";
    const sourceSql = getSourceSql?.();
    const referencedEntities =
      selectedTables.map((table) => ({
        model: "table" as const,
        id: table.id,
      })) ?? [];
    generate({ prompt, sourceSql, referencedEntities });
  }, [generate, getSourceSql, selectedTables]);

  const handleClose = useCallback(() => {
    cancelRequest();
    onClose();
  }, [cancelRequest, onClose]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (e) => {
          if (!isSubmitDisabled) {
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
  }, [isSubmitDisabled, handleSubmit, handleClose]);

  return (
    <Box className={S.container} data-testid="metabot-inline-sql-prompt">
      {isTableBarEnabled && (
        <Box className={S.tableBar}>
          <TablePillsInput
            disabled={isLoading}
            databaseId={databaseId}
            selectedTables={selectedTables}
            onChange={onSelectedTablesChange}
            onEnterPress={() => promptInputRef.current?.focus()}
            autoFocus={isTableBarEnabled}
          />
        </Box>
      )}
      <Box className={S.inputContainer}>
        <MetabotPromptInput
          ref={promptInputRef}
          value={value}
          placeholder={
            isTableBarEnabled
              ? t`Then, ask for what you'd like to see. Type @ to mention an item.`
              : t`Describe what SQL you want, type @ to mention an item.`
          }
          autoFocus={!isTableBarEnabled}
          disabled={isLoading}
          onChange={onValueChange}
          onStop={handleClose}
          suggestionConfig={{
            suggestionModels,
            searchOptions: databaseId ? { table_db_id: databaseId } : undefined,
          }}
        />
      </Box>
      <Flex justify="space-between" align="center" gap="sm" mt="xs">
        <Box data-testid="metabot-inline-sql-error" w="100%" fz="sm" c="error">
          {error}
        </Box>
        <Flex gap="xs" flex="1 0 auto">
          <Tooltip disabled={isLoading} label={t`Send to Metabot`}>
            <Button
              className={S.submitButton}
              data-testid="metabot-inline-sql-generate"
              size="xs"
              variant="filled"
              px="0"
              w="1.875rem"
              styles={{ label: { display: "flex" } }}
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
            >
              {isLoading ? (
                <Loader
                  size="xs"
                  color="text-tertiary"
                  data-testid="metabot-inline-sql-generating"
                />
              ) : (
                <Icon name="send" />
              )}
            </Button>
          </Tooltip>
          <Button
            className={S.cancelButton}
            data-testid="metabot-inline-sql-cancel"
            size="xs"
            variant="subtle"
            onClick={handleClose}
          >
            {t`Cancel`}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
