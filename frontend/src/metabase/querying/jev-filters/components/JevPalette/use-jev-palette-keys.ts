import type { KeyboardEvent } from "react";
import { useRef } from "react";

interface UseJevPaletteKeysOptions {
  onMove: (delta: 1 | -1) => void;
  onCycle: (delta: 1 | -1) => void;
  onEnter: () => void;
  onClose: () => void;
  /** The palette's own opening chord, swallowed so the browser doesn't act on it. */
  isOwnHotkey?: (event: globalThis.KeyboardEvent) => boolean;
}

/**
 * The palettes' shared keyboard model: ↑↓ move rows, Tab/Shift+Tab and →/← cycle
 * the active row's options, Enter applies, Esc closes.
 */
export function useJevPaletteKeys({
  onMove,
  onCycle,
  onEnter,
  onClose,
  isOwnHotkey,
}: UseJevPaletteKeysOptions) {
  const lastKeyWasCycleRef = useRef(false);

  return (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const isCaretAtEnd =
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length;
    const wasCycling = lastKeyWasCycleRef.current;
    lastKeyWasCycleRef.current = false;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        onMove(event.key === "ArrowDown" ? 1 : -1);
        return;
      case "Tab":
        // Stop the modal's focus trap from moving focus off the input.
        event.preventDefault();
        event.stopPropagation();
        onCycle(event.shiftKey ? -1 : 1);
        lastKeyWasCycleRef.current = true;
        return;
      case "ArrowRight":
        if (isCaretAtEnd && !event.shiftKey) {
          event.preventDefault();
          onCycle(1);
          lastKeyWasCycleRef.current = true;
        }
        return;
      case "ArrowLeft":
        // ← only cycles right after a cycle (or on empty text) so it can still move the caret.
        if (
          isCaretAtEnd &&
          !event.shiftKey &&
          (wasCycling || input.value === "")
        ) {
          event.preventDefault();
          onCycle(-1);
          lastKeyWasCycleRef.current = true;
        }
        return;
      case "Enter":
        event.preventDefault();
        onEnter();
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      default:
        if (isOwnHotkey?.(event.nativeEvent)) {
          event.preventDefault();
        }
    }
  };
}
