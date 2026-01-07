import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import type { MetabotPromptInputRef } from "metabase/metabot";
import { Box, Button, Flex, Icon, Loader } from "metabase/ui";
import { useMetabotDispatch } from "metabase-enterprise/metabot/hooks/use-metabot-store";
import { addSuggestedCodeEdit } from "metabase-enterprise/metabot/state";
import type { DatabaseId, MetabotCodeEdit } from "metabase-types/api";

import { MetabotPromptInput } from "../MetabotPromptInput";

import S from "./MetabotInlineSQLPrompt.module.css";

interface OSSGenerateSqlResponse {
  parts: Array<{
    type: string;
    version: number;
    value: MetabotCodeEdit;
  }>;
}

async function generateSqlOSS(
  prompt: string,
  databaseId: number,
  bufferId: string,
  signal?: AbortSignal,
): Promise<MetabotCodeEdit | null> {
  const response = await fetch("/api/llm/generate-sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      database_id: databaseId,
      buffer_id: bufferId,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to generate SQL");
  }

  const data: OSSGenerateSqlResponse = await response.json();
  const codeEditPart = data.parts.find((p) => p.type === "code_edit");
  return codeEditPart?.value ?? null;
}

interface MetabotInlineSQLPromptProps {
  databaseId: DatabaseId | null;
  onClose: () => void;
}

export const MetabotInlineSQLPrompt = ({
  databaseId,
  onClose,
}: MetabotInlineSQLPromptProps) => {
  const inputRef = useRef<MetabotPromptInputRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [value, setValue] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useMetabotDispatch();

  const disabled = !value.trim() || isLoading || !databaseId;

  const handleSubmit = useCallback(async () => {
    const promptValue = inputRef.current?.getValue?.().trim() ?? "";
    if (!promptValue || !databaseId) {
      return;
    }

    setHasError(false);
    setIsLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const codeEdit = await generateSqlOSS(
        promptValue,
        databaseId,
        "qb",
        abortControllerRef.current.signal,
      );

      if (codeEdit) {
        dispatch(addSuggestedCodeEdit({ ...codeEdit, active: true }));
      } else {
        setHasError(true);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("OSS SQL generation failed:", error);
        setHasError(true);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [databaseId, dispatch]);

  const handleClose = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    onClose();
  }, [onClose]);

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
              <Loader size="xs" color="text-light" />
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
        {!databaseId && (
          <Box fz="sm" c="warning" ml="sm">{t`Select a database first`}</Box>
        )}
        {hasError && (
          <Box
            data-testid="metabot-inline-sql-error"
            fz="sm"
            c="error"
            ml="sm"
          >{t`Something went wrong. Please try again.`}</Box>
        )}
      </Flex>
    </Box>
  );
};
