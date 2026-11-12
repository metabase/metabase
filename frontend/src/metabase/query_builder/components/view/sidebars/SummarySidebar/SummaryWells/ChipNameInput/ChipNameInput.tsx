import {
  type FocusEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import S from "./ChipNameInput.module.css";

type ChipNameInputProps = {
  name: string;
  onRename: (name: string) => void;
  /** `moveFocus` is true when no element outside the chip took the focus. */
  onClose: (moveFocus: boolean) => void;
};

/**
 * Edits a chip's name in place. Enter or leaving the field keeps a changed name, Escape drops it.
 * Pointer and key events stay inside, so the draggable chip around it doesn't react to editing.
 */
export function ChipNameInput({ name, onRename, onClose }: ChipNameInputProps) {
  const [value, setValue] = useState(name);
  const isDoneRef = useRef(false);
  // The removal of the chip blurs this field. That blur must not rename the removed chip.
  useLayoutEffect(() => {
    isDoneRef.current = false;
    return () => {
      isDoneRef.current = true;
    };
  }, []);

  const finish = (keepChanges: boolean, moveFocus: boolean) => {
    if (isDoneRef.current) {
      return;
    }
    isDoneRef.current = true;
    const nextName = value.trim();
    if (keepChanges && nextName.length > 0 && nextName !== name) {
      onRename(nextName);
    }
    onClose(moveFocus);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Enter") {
      finish(true, true);
    } else if (event.key === "Escape") {
      finish(false, true);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const chip = event.currentTarget.parentElement;
    const isFocusInChip =
      event.relatedTarget instanceof Node &&
      chip?.contains(event.relatedTarget);
    finish(true, isFocusInChip === true);
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
      onBlur={handleBlur}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    />
  );
}
