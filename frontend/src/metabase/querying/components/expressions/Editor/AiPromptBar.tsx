import cx from "classnames";
import { type KeyboardEvent, type RefObject, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Button, Loader } from "metabase/ui";

import S from "./AiPromptBar.module.css";
import AiIcon from "./ai.svg?component";
import CloseIcon from "./close.svg?component";

type AiPromptBarProps = {
  isLoading: boolean;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Returns true when the AI changed the code, which clears the prompt. */
  onSubmit: (prompt: string) => Promise<boolean>;
  onClose: () => void;
};

/**
 * A request to the AI to change the code, under the code. It stays open for
 * the next request after each result.
 */
export function AiPromptBar({
  isLoading,
  error,
  inputRef,
  onSubmit,
  onClose,
}: AiPromptBarProps) {
  const [value, setValue] = useState("");
  const prompt = value.trim();
  const canSubmit = prompt !== "" && !isLoading;

  const submit = async () => {
    if (canSubmit && (await onSubmit(prompt))) {
      setValue("");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className={cx(S.bar, { [S.loading]: isLoading })}
      data-testid="expression-ai-prompt"
    >
      <div className={S.row}>
        <span className={S.icon}>
          {isLoading ? <Loader size="xs" /> : <AiIcon aria-hidden />}
        </span>
        <input
          ref={inputRef}
          className={S.input}
          aria-label={t`Ask AI`}
          placeholder={t`Add your prompt...`}
          value={value}
          autoFocus
          readOnly={isLoading}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          size="sm"
          variant="light"
          color="neutral"
          miw={64}
          disabled={!canSubmit}
          // The cursor stays in the prompt.
          onMouseDown={(event) => event.preventDefault()}
          onClick={submit}
        >{t`Send`}</Button>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="neutral"
          aria-label={t`Close the prompt`}
          onClick={onClose}
        >
          <CloseIcon />
        </ActionIcon>
      </div>
      {error != null && (
        <div className={S.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
