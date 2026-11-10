import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import {
  type ExpressionError,
  getLineAndColumn,
  isExpressionError,
} from "metabase/querying/expressions";
import { Button, Flex, Icon, Loader } from "metabase/ui";

import type { GenerateExpressionResult } from "../GenerateExpressionPrompt/use-generate-expression";

import S from "./Errors/Errors.module.css";

/**
 * "Fix with AI" for the error bar: a button, and a note when the AI does not
 * fix the error. The button asks the AI with a fixed prompt and proposes the
 * fix as a diff. The note stays until the text changes. A `replacement`, like
 * the SQL hint, replaces the error and the button.
 */
export function useFixErrorAction({
  error,
  source,
  isEnabled,
  generate,
  proposeSource,
  replacement = null,
}: {
  error?: ExpressionError | Error | null;
  source: string;
  isEnabled: boolean;
  generate: (request: {
    prompt: string;
    source: string;
  }) => Promise<GenerateExpressionResult | null>;
  proposeSource: (source: string, name?: string) => void;
  /** The content to show instead of the error, when there is one. */
  replacement?: ReactNode;
}) {
  const [isFixing, setIsFixing] = useState(false);
  const [refusal, setRefusal] = useState<{ source: string; message: string }>();

  const handleFix = useCallback(async () => {
    if (error == null) {
      return;
    }
    const position =
      isExpressionError(error) && error.pos != null
        ? getLineAndColumn(source, error.pos)
        : null;
    const where = position
      ? ` at line ${position.line}, column ${position.column}`
      : "";
    setIsFixing(true);
    const result = await generate({
      prompt:
        `Fix this error in the current expression${where}: "${error.message}". ` +
        "Keep what the user meant and change as little as possible. When it is not clear what the user meant, " +
        "or the error cannot be fixed, do not guess: return a message that says why and what the user can do.",
      source,
    });
    setIsFixing(false);
    if (result == null) {
      return;
    }
    if ("message" in result) {
      setRefusal({ source, message: result.message });
    } else {
      proposeSource(result.expression, result.name);
    }
  }, [error, source, generate, proposeSource]);

  if (!isEnabled || error == null) {
    return { action: null, note: null, content: null };
  }
  if (replacement != null) {
    return { action: null, note: null, content: replacement };
  }
  if (refusal?.source === source) {
    return {
      action: null,
      note: (
        <Flex gap="sm" align="flex-start" c="text-secondary" fz="sm">
          <Icon name="metabot" className={S.noteIcon} />
          {refusal.message}
        </Flex>
      ),
      content: null,
    };
  }
  return {
    action: (
      <Button
        size="compact-sm"
        variant="subtle"
        leftSection={isFixing ? <Loader size="xs" /> : <Icon name="metabot" />}
        disabled={isFixing}
        onClick={handleFix}
      >
        {t`Fix with AI`}
      </Button>
    ),
    note: null,
    content: null,
  };
}
