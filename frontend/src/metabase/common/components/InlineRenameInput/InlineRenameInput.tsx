import cx from "classnames";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import S from "./InlineRenameInput.module.css";

// how long after editing starts a blur is taken for focus being moved, not the user leaving
const SETTLE_MS = 400;

type InlineRenameInputProps = {
  initialValue: string;
  className?: string;
  "aria-label"?: string;
  /** Enter or a click elsewhere, with the trimmed name; it may be empty. */
  onCommit: (name: string) => void;
  /** Esc. */
  onCancel: () => void;
};

/**
 * A name edited in place, inside whatever chip or pill shows it: it takes its container's type,
 * grows with what's typed, and starts with the whole name selected. Pointer and key events stay
 * inside, so a draggable or clickable container doesn't react to editing.
 */
export function InlineRenameInput({
  initialValue,
  className,
  "aria-label": ariaLabel,
  onCommit,
  onCancel,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and Esc blur the input, which would commit a second time
  const isDoneRef = useRef(false);
  // a popover that opened on a double-click's clicks can take focus as it opens or closes
  const settlesAtRef = useRef(0);

  useEffect(() => {
    settlesAtRef.current = performance.now() + SETTLE_MS;
    inputRef.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (isDoneRef.current) {
      return;
    }
    isDoneRef.current = true;
    if (commit) {
      onCommit(value.trim());
    } else {
      onCancel();
    }
  };

  const handleBlur = () => {
    if (performance.now() < settlesAtRef.current) {
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return;
    }
    finish(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };

  return (
    <input
      ref={inputRef}
      className={cx(S.input, className)}
      value={value}
      aria-label={ariaLabel}
      autoFocus
      spellCheck={false}
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      // keeps Esc from also closing a surrounding sidesheet or modal
      data-mantine-stop-propagation
    />
  );
}
