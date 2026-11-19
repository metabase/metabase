import cx from "classnames";
import type { ChangeEvent, KeyboardEvent } from "react";
import { t } from "ttag";

import { Icon, Textarea, Tooltip, UnstyledButton } from "metabase/ui";

import LoadingDots from "../../../components/expressions/EditorB/loading-dots.svg?component";

import S from "./InlineExpressionEditorB.module.css";

type AiPromptProps = {
  prompt: string;
  /** The current expression, sent to the AI as the thing to change. */
  context: string | null;
  isGenerating: boolean;
  error?: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  /** "=" in an empty prompt: write the expression by hand instead. */
  onEnterCode: () => void;
  onRemoveContext: () => void;
  onClose: () => void;
};

/**
 * Version B: the AI mode. A plain prompt; what's typed or pasted, including
 * SQL or a spreadsheet formula, goes to the AI.
 */
export function AiPrompt({
  prompt,
  context,
  isGenerating,
  error,
  onPromptChange,
  onSubmit,
  onEnterCode,
  onRemoveContext,
  onClose,
}: AiPromptProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
    // Typed only: a pasted "=IF(…)" is a formula for the AI to convert.
    if (event.key === "=" && prompt === "" && !hasModifier) {
      event.preventDefault();
      onEnterCode();
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className={S.ai}>
      <div className={S.promptRow}>
        {isGenerating && (
          <LoadingDots className={S.loadingDots} aria-label={t`Loading`} />
        )}
        <div className={S.promptField}>
          <Textarea
            variant="unstyled"
            autosize
            minRows={1}
            value={prompt}
            readOnly={isGenerating}
            aria-label={t`Ask AI`}
            classNames={{
              root: S.promptRoot,
              wrapper: S.promptWrapper,
              input: cx(S.promptInput, { [S.isGenerating]: isGenerating }),
            }}
            autoFocus
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onPromptChange(event.target.value)
            }
            onKeyDown={handleKeyDown}
          />
          {prompt === "" && (
            <div className={S.placeholder} aria-hidden>
              {t`Ask AI, or press`}
              <span className={S.key}>=</span>
              {t`to write an expression`}
            </div>
          )}
        </div>
      </div>
      {error != null && !isGenerating && <div className={S.error}>{error}</div>}
      {context != null && (
        <div className={S.context}>
          <Tooltip label={context} maw={480}>
            <span className={S.contextCode}>{context}</span>
          </Tooltip>
          <UnstyledButton
            className={S.contextRemove}
            aria-label={t`Remove the expression`}
            onClick={onRemoveContext}
          >
            <Icon name="close" size={10} />
          </UnstyledButton>
        </div>
      )}
    </div>
  );
}
