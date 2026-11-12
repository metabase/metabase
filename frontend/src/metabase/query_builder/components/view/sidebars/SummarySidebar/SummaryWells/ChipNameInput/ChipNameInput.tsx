import { type KeyboardEvent, useRef, useState } from "react";
import { t } from "ttag";

import S from "./ChipNameInput.module.css";

type ChipNameInputProps = {
  name: string;
  onRename: (name: string) => void;
  onClose: () => void;
};

/**
 * Edits a chip's name in place. Enter or leaving the field keeps a changed name, Escape drops it.
 * Pointer and key events stay inside, so the draggable chip around it doesn't react to editing.
 */
export function ChipNameInput({ name, onRename, onClose }: ChipNameInputProps) {
  const [value, setValue] = useState(name);
  // Enter and Escape unmount the field, which can blur it a second time
  const isDoneRef = useRef(false);

  const finish = (keepChanges: boolean) => {
    if (isDoneRef.current) {
      return;
    }
    isDoneRef.current = true;
    const nextName = value.trim();
    if (keepChanges && nextName.length > 0 && nextName !== name) {
      onRename(nextName);
    }
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      finish(true);
    } else if (event.key === "Escape") {
      finish(false);
    }
  };

  return (
    <input
      className={S.input}
      value={value}
      aria-label={t`Rename ${name}`}
      autoFocus
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => finish(true)}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}
