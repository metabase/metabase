import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

import S from "./MetabotInlineSQLPrompt.module.css";

interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  bufferId: string;
  onClose: () => void;
}

export const MetabotInlineSQLPrompt = ({
  databaseId,
  bufferId,
  onClose,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const [value, setValue] = useState("");
  const { isLoading, error, generate, cancelRequest } =
    PLUGIN_METABOT.useMetabotSQLSuggestion(bufferId);

  const disabled = !value.trim() || isLoading;

  const handleSubmit = useCallback(async () => {
    const prompt = inputRef.current?.getValue?.().trim() ?? "";
    generate(prompt);
  }, [generate]);

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
            suggestionModels: [
              "dataset",
              "metric",
              "card",
              "table",
              "database",
            ],
            searchOptions: databaseId ? { table_db_id: databaseId } : undefined,
          }}
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
