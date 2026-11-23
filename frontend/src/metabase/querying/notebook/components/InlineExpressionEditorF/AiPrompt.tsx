import cx from "classnames";
import type { ChangeEvent, KeyboardEvent } from "react";
import { jt, t } from "ttag";

import { Icon, Textarea, UnstyledButton } from "metabase/ui";

import S from "./InlineExpressionEditorF.module.css";

type AiPromptProps = {
  prompt: string;
  /** The current expression, sent to the AI as the thing to change. */
  context: string | null;
  isGenerating: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  /** "=" in an empty prompt: write the expression by hand instead. */
  onEnterCode: () => void;
  onRemoveContext: () => void;
  onClose: () => void;
};

/**
 * Version F: the AI mode. A plain prompt; what's typed or pasted, including
 * SQL or a spreadsheet formula, goes to the AI.
 */
export function AiPrompt({
  prompt,
  context,
  isGenerating,
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
              {context != null
                ? jt`Ask AI, or press ${(
                    <kbd key="key" className={S.key}>
                      =
                    </kbd>
                  )} to edit the expression`
                : jt`Ask AI, or press ${(
                    <kbd key="key" className={S.key}>
                      =
                    </kbd>
                  )} to write an expression`}
            </div>
          )}
        </div>
      </div>
      {context != null && (
        // A double-click opens the expression in code mode.
        <div
          className={cx(S.context, { [S.isDisabled]: isGenerating })}
          onDoubleClick={isGenerating ? undefined : onEnterCode}
        >
          <span className={S.contextCode}>= {context}</span>
          <UnstyledButton
            className={S.contextRemove}
            aria-label={t`Remove the expression`}
            disabled={isGenerating}
            onClick={onRemoveContext}
          >
            <Icon name="close" size={12} />
          </UnstyledButton>
        </div>
      )}
    </div>
  );
}
