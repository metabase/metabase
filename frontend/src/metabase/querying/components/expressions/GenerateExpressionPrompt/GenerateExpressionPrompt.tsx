import { useCallback, useEffect, useRef, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

/* eslint-disable boundaries/element-types -- reuse the Metabot prompt input until this is past the prototype */
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotPromptInput } from "metabase/metabot/components/MetabotPromptInput";
import { MetabotSendButton } from "metabase/metabot/components/MetabotSendButton";
import { MetabotWorkingIndicator } from "metabase/metabot/components/MetabotWorkingIndicator";
/* eslint-enable boundaries/element-types */
import { Box, Button, Flex, Tooltip } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./GenerateExpressionPrompt.module.css";
import { useGenerateExpression } from "./use-generate-expression";

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
  const { generate, cancel, isLoading } = useGenerateExpression({
    query,
    stageIndex,
    expressionMode,
    availableColumns,
    name,
    hasDefaultName,
    validate,
  });
  const [error, setError] = useState<string>();

  const isSubmitDisabled = !value.trim() || isLoading;

  const handleSubmit = useCallback(async () => {
    const prompt = promptInputRef.current?.getValue?.().trim() ?? "";
    if (!prompt) {
      return;
    }
    setError(undefined);
    const result = await generate({ prompt, source: getSource() });
    if (result == null) {
      return;
    }
    if ("message" in result) {
      setError(result.message);
    } else {
      onGenerate(result.expression, result.name);
    }
  }, [generate, getSource, onGenerate]);

  const handleClose = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

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
            onClick={isLoading ? cancel : handleSubmit}
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
