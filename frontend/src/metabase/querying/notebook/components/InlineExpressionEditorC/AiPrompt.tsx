import cx from "classnames";
import type { ChangeEvent, KeyboardEvent } from "react";
import { t } from "ttag";

import { Textarea } from "metabase/ui";

import S from "./InlineExpressionEditorC.module.css";
import { CONVERT_FROM_NAMES, type ConvertFrom } from "./ModeMenu";

type AiPromptProps = {
  prompt: string;
  /** Set when the prompt is code for the AI to convert, like SQL. */
  convertFrom: ConvertFrom | null;
  isGenerating: boolean;
  error?: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  /** "=" in an empty prompt: write the expression by hand instead. */
  onEnterCode: () => void;
  onClose: () => void;
};

/**
 * Version C: the AI mode. A plain prompt, or code to convert, in a code font,
 * after Convert in the mode menu.
 */
export function AiPrompt({
  prompt,
  convertFrom,
  isGenerating,
  error,
  onPromptChange,
  onSubmit,
  onEnterCode,
  onClose,
}: AiPromptProps) {
  const isConverting = convertFrom != null;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
    // Code to convert, like a spreadsheet formula, can start with "=".
    if (event.key === "=" && prompt === "" && !isConverting && !hasModifier) {
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

  const placeholder = isConverting
    ? t`Convert ${CONVERT_FROM_NAMES[convertFrom]} to custom expression`
    : t`Ask AI`;

  return (
    <div className={S.ai}>
      <Textarea
        // A new mode starts with an empty prompt, with the focus.
        key={convertFrom ?? "ai"}
        variant="unstyled"
        autosize
        minRows={1}
        value={prompt}
        placeholder={placeholder}
        readOnly={isGenerating}
        aria-label={placeholder}
        classNames={{
          root: S.promptRoot,
          wrapper: S.promptWrapper,
          input: cx(S.promptInput, {
            [S.isCode]: isConverting,
            [S.isGenerating]: isGenerating,
          }),
        }}
        autoFocus
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onPromptChange(event.target.value)
        }
        onKeyDown={handleKeyDown}
      />
      {error != null && !isGenerating && <div className={S.error}>{error}</div>}
    </div>
  );
}
