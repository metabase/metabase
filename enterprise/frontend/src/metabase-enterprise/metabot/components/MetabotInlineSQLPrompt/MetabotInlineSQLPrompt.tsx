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

interface StreamingCallbacks {
  onTextDelta: (text: string) => void;
  onCodeEdit: (edit: MetabotCodeEdit) => void;
  onError: (message: string) => void;
}

async function generateSqlStreaming(
  prompt: string,
  databaseId: number,
  bufferId: string,
  callbacks: StreamingCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/llm/generate-sql-streaming", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
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

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) {
      streamDone = true;
      continue;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) {
        continue;
      }

      // AI SDK v5 format: prefix:json_value
      // 0: = text delta, 2: = data part, 3: = error, d: = finish
      if (line.startsWith("0:")) {
        const text = JSON.parse(line.slice(2));
        callbacks.onTextDelta(text);
      } else if (line.startsWith("2:")) {
        const part = JSON.parse(line.slice(2));
        if (part.type === "code_edit") {
          callbacks.onCodeEdit(part.value);
        }
      } else if (line.startsWith("3:")) {
        const error = JSON.parse(line.slice(2));
        callbacks.onError(error.message || "Unknown error");
      }
    }
  }
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
  const [streamingText, setStreamingText] = useState("");
  const dispatch = useMetabotDispatch();

  const disabled = !value.trim() || isLoading || !databaseId;

  const handleSubmit = useCallback(async () => {
    const promptValue = inputRef.current?.getValue?.().trim() ?? "";
    if (!promptValue || !databaseId) {
      return;
    }

    setHasError(false);
    setIsLoading(true);
    setStreamingText("");

    abortControllerRef.current = new AbortController();

    try {
      await generateSqlStreaming(
        promptValue,
        databaseId,
        "qb",
        {
          onTextDelta: (text) => {
            setStreamingText((prev) => prev + text);
          },
          onCodeEdit: (edit) => {
            dispatch(addSuggestedCodeEdit({ ...edit, active: true }));
          },
          onError: (message) => {
            console.error("Streaming error:", message);
            setHasError(true);
          },
        },
        abortControllerRef.current.signal,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("OSS SQL generation failed:", error);
        setHasError(true);
      }
    } finally {
      setIsLoading(false);
      setStreamingText("");
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
      {streamingText && (
        <Box
          data-testid="metabot-inline-sql-preview"
          mt="sm"
          p="sm"
          bg="bg-light"
          style={{
            borderRadius: "var(--mantine-radius-sm)",
            fontFamily: "monospace",
            fontSize: "12px",
            whiteSpace: "pre-wrap",
            maxHeight: "150px",
            overflow: "auto",
          }}
        >
          {streamingText}
        </Box>
      )}
    </Box>
  );
};
