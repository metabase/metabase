import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import { Icon, Loader } from "metabase/ui";

import S from "./Editor.module.css";

type InlinePromptProps = {
  isLoading: boolean;
  error?: string;
  onSubmit: (prompt: string) => void;
  onClose: () => void;
};

/** A prompt to the AI inside the code, at the place where the user typed "@". */
export function InlinePrompt({
  isLoading,
  error,
  onSubmit,
  onClose,
}: InlinePromptProps) {
  const [value, setValue] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (value.trim() !== "" && !isLoading) {
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

  const placeholder = t`Ask AI, Enter to send`;

  return (
    <span className={S.inlinePrompt} data-testid="expression-inline-prompt">
      {isLoading ? (
        <Loader size={12} />
      ) : (
        <Icon name="ai" size={12} className={S.inlinePromptIcon} />
      )}
      <input
        className={S.inlinePromptInput}
        aria-label={t`Ask AI`}
        value={value}
        placeholder={placeholder}
        size={(value || placeholder).length + 1}
        autoFocus
        readOnly={isLoading}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {error && <span className={S.inlinePromptError}>{error}</span>}
    </span>
  );
}
