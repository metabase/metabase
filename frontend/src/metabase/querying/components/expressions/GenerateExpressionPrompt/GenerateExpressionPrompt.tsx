import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils/errors";
/* eslint-disable boundaries/element-types -- reuse the Metabot prompt input until this is past the prototype */
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { MetabotSendButton } from "metabase/metabot/components/MetabotSendButton";
import { MetabotWorkingIndicator } from "metabase/metabot/components/MetabotWorkingIndicator";
/* eslint-enable boundaries/element-types */
import { formatIdentifier } from "metabase/querying/expressions";
import { Box, Button, Flex, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./GenerateExpressionPrompt.module.css";
import { useGenerateExpressionMutation } from "./api";

// The first try, then retries that get the editor's errors for the earlier tries.
const MAX_ATTEMPTS = 3;

type GenerateExpressionPromptProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  /** Absent for a column that is not created yet. */
  name?: string;
  hasDefaultName: boolean;
  value: string;
  getSource: () => string;
  /** Returns the editor's error for `source`, or null when it is valid. */
  validate: (source: string) => string | null;
  onValueChange: (value: string) => void;
  onGenerate: (expression: string, name?: string) => void;
  onClose: () => void;
};

export function GenerateExpressionPrompt({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name,
  hasDefaultName,
  value,
  getSource,
  validate,
  onValueChange,
  onGenerate,
  onClose,
}: GenerateExpressionPromptProps) {
  const promptInputRef = useRef<MetabotPromptInputRef>(null);
  const [generateExpression] = useGenerateExpressionMutation();
  const requestRef = useRef<ReturnType<typeof generateExpression> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const isSubmitDisabled = !value.trim() || isLoading;

  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsLoading(false);
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  const handleSubmit = useCallback(async () => {
    const prompt = promptInputRef.current?.getValue?.().trim() ?? "";
    if (!prompt) {
      return;
    }
    setError(undefined);
    setIsLoading(true);
    const columns = availableColumns.map((column) =>
      formatIdentifier(
        Lib.displayInfo(query, stageIndex, column).longDisplayName,
      ),
    );
    const previousAttempts: { expression: string; error: string }[] = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const request = generateExpression({
        prompt,
        source: getSource(),
        expression_mode: expressionMode,
        columns,
        name,
        has_default_name: hasDefaultName,
        previous_attempts: previousAttempts,
      });
      requestRef.current = request;
      const result = await request;
      if (requestRef.current !== request) {
        return;
      }
      if (!result.data) {
        requestRef.current = null;
        setIsLoading(false);
        if (!isAborted(result.error)) {
          setError(getErrorMessage(result.error));
        }
        return;
      }

      if ("message" in result.data) {
        requestRef.current = null;
        setIsLoading(false);
        setError(result.data.message);
        return;
      }

      const { expression, name: generatedName } = result.data;
      const validationError = validate(expression);
      // After the last try, show the expression anyway. The editor shows its error.
      if (validationError == null || attempt === MAX_ATTEMPTS) {
        requestRef.current = null;
        setIsLoading(false);
        onGenerate(expression, generatedName);
        return;
      }
      previousAttempts.push({ expression, error: validationError });
    }
  }, [
    generateExpression,
    getSource,
    validate,
    expressionMode,
    availableColumns,
    name,
    hasDefaultName,
    query,
    stageIndex,
    onGenerate,
  ]);

  const handleClose = useCallback(() => {
    cancelRequest();
    onClose();
  }, [cancelRequest, onClose]);

  useEffect(() => {
    return tinykeys(
      window,
      {
        "$mod+Enter": (event) => {
          if (!isSubmitDisabled) {
            event.preventDefault();
            handleSubmit();
          }
        },
      },
      { capture: true },
    );
  }, [isSubmitDisabled, handleSubmit]);

  return (
    <Box className={S.container} data-testid="generate-expression-prompt">
      <Box className={S.inputContainer}>
        <MetabotPromptInput
          ref={promptInputRef}
          value={value}
          placeholder={t`Describe the expression you want`}
          autoFocus
          disabled={isLoading}
          onChange={onValueChange}
          onStop={handleClose}
          suggestionConfig={{ suggestionModels: [] }}
          disableMentions
        />
      </Box>
      <Flex direction="row-reverse" justify="space-between" align="center">
        <Tooltip label={isLoading ? t`Stop generating` : t`Generate`}>
          <MetabotSendButton
            aria-label={isLoading ? t`Stop generating` : t`Generate`}
            isResponding={isLoading}
            onClick={isLoading ? cancelRequest : handleSubmit}
            disabled={!isLoading && isSubmitDisabled}
          />
        </Tooltip>
        {isLoading ? (
          <MetabotWorkingIndicator ta="right" flex={1} fz="sm" pr="sm" />
        ) : (
          <Box
            ta="right"
            flex={1}
            miw={0}
            fz="sm"
            pr="sm"
            c="feedback-negative"
          >
            {error}
          </Box>
        )}
        <Button
          className={S.cancelButton}
          fz="sm"
          px="sm"
          ml="-sm"
          fw="normal"
          variant="subtle"
          onClick={handleClose}
        >
          {t`Cancel`}
        </Button>
      </Flex>
    </Box>
  );
}

function isAborted(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
