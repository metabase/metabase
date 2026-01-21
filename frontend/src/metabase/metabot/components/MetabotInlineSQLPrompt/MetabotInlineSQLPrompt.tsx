import { useCallback, useEffect, useRef } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import S from "./MetabotInlineSQLPrompt.module.css";
import { TablePillsInput } from "./TablePillsInput";

interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  onClose: () => void;
  isLoading: boolean;
  error: string | undefined;
  generate: (value: string, sourceSql?: string) => Promise<void>;
  cancelRequest: () => void;
  suggestionModels: SuggestionModel[];
  getSourceSql?: () => string;
  value: string;
  onValueChange: (value: string) => void;
  selectedTableIds: TableId[];
  onSelectedTableIdsChange: (tableIds: TableId[]) => void;
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
  value,
  onValueChange,
  selectedTableIds,
  onSelectedTableIdsChange,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);

  const disabled = !value.trim() || isLoading;

  const handleSubmit = useCallback(async () => {
    const prompt = inputRef.current?.getValue?.().trim() ?? "";
    const sourceSql = getSourceSql?.();
    generate(prompt, sourceSql);
  }, [generate, getSourceSql]);

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

  const isTableBarEnabled = !useHasTokenFeature("metabot_v3");
  const shouldAutoFocusTableBar =
    isTableBarEnabled && selectedTableIds.length === 0;

  return (
    <Box className={S.container} data-testid="metabot-inline-sql-prompt">
      <Box className={S.inputContainer}>
        {isTableBarEnabled && (
          <Box className={S.tableBar}>
            <TablePillsInput
              databaseId={databaseId}
              selectedTableIds={selectedTableIds}
              onChange={onSelectedTableIdsChange}
              autoFocus={shouldAutoFocusTableBar}
            />
          </Box>
        )}
        <MetabotPromptInput
          ref={inputRef}
          value={value}
          placeholder={
            isTableBarEnabled
              ? t`Then, ask for what you'd like to see.`
              : t`Describe what SQL you want...`
          }
          autoFocus={!shouldAutoFocusTableBar}
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
          <Button
            data-testid="metabot-inline-sql-cancel"
            size="xs"
            variant="subtle"
            onClick={handleClose}
          >
            {t`Cancel`}
          </Button>
          <Button
            data-testid="metabot-inline-sql-generate"
            size="xs"
            variant="filled"
            px="0"
            w="1.875rem"
            styles={{ label: { display: "flex" } }}
            onClick={handleSubmit}
            disabled={disabled}
          >
            {isLoading ? (
              <Loader size="xs" color="text-tertiary" />
            ) : (
              <Icon name="send" />
            )}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};
