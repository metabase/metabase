import cx from "classnames";
import type { ChangeEvent, KeyboardEvent, Ref } from "react";
import { t } from "ttag";

import { Textarea } from "metabase/ui";

import LoadingDots from "../../../components/expressions/EditorD/loading-dots.svg?component";

import S from "./InlineExpressionEditorD.module.css";

type AiPromptProps = {
  ref?: Ref<HTMLTextAreaElement>;
  prompt: string;
  isGenerating: boolean;
  /** True when the editor opens without code, so the prompt takes the focus. */
  autoFocus: boolean;
  error?: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  /** "=" in an empty prompt: write the expression by hand, below. */
  onEnterCode: () => void;
  onClose: () => void;
};

/**
 * Version D: the AI prompt, always above the code. A prompt with code below
 * asks the AI to change that code.
 */
export function AiPrompt({
  ref,
  prompt,
  isGenerating,
  autoFocus,
  error,
  onPromptChange,
  onSubmit,
  onEnterCode,
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
        <Textarea
          ref={ref}
          variant="unstyled"
          autosize
          minRows={1}
          value={prompt}
          placeholder={t`Ask AI`}
          readOnly={isGenerating}
          aria-label={t`Ask AI`}
          classNames={{
            root: S.promptRoot,
            wrapper: S.promptWrapper,
            input: cx(S.promptInput, { [S.isGenerating]: isGenerating }),
          }}
          autoFocus={autoFocus}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            onPromptChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
        />
      </div>
      {error != null && !isGenerating && <div className={S.error}>{error}</div>}
    </div>
  );
}
