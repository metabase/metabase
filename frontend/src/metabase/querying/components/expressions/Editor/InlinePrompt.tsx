import cx from "classnames";
import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import S from "./Editor.module.css";
import ErrorsS from "./Errors/Errors.module.css";
import { PROMPT_TRIGGER } from "./inline-prompt";
import LoadingDots from "./loading-dots.svg?component";

type InlinePromptProps = {
  isLoading: boolean;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
};

/** A prompt to the AI inside the code, at the place where the user typed "@". */
export function InlinePrompt({
  isLoading,
  onSubmit,
  onClose,
}: InlinePromptProps) {
  const [value, setValue] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // An empty prompt asks the AI to finish the expression at the cursor.
      if (!isLoading) {
        onSubmit(value.trim());
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Backspace" && value === "") {
      event.preventDefault();
      onClose();
    }
  };

  const placeholder = t`Ask AI, or press Enter to finish`;

  return (
    <span
      className={cx(S.inlinePrompt, { [S.loading]: isLoading })}
      data-testid="expression-inline-prompt"
    >
      {PROMPT_TRIGGER}
      <input
        className={S.inlinePromptInput}
        aria-label={t`Ask AI`}
        value={value}
        placeholder={placeholder}
        // The editor font is monospace, so a character is 1ch wide.
        style={{ width: `calc(${(value || placeholder).length}ch + 1px)` }}
        autoFocus
        readOnly={isLoading}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </span>
  );
}

/** The row under the code that shows that the AI works, or why it failed. */
export function InlinePromptStatus({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error?: string;
}) {
  if (isLoading) {
    return (
      <div className={cx(ErrorsS.errors, ErrorsS.inline, S.promptStatus)}>
        <LoadingDots className={S.loadingDots} aria-hidden />
        <span role="status">{t`Mulling...`}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className={cx(ErrorsS.errors, ErrorsS.inline)} role="alert">
        <span className={ErrorsS.title}>{t`AI can't do this`}</span>
        <span className={ErrorsS.message}>{error}</span>
      </div>
    );
  }
  return null;
}
