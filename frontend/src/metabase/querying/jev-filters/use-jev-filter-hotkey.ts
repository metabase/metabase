import { useEffect } from "react";
import { useLatest } from "react-use";

import { isMac } from "metabase/utils/browser";

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  return (
    element.isContentEditable ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.getAttribute("role") === "textbox" ||
    element.getAttribute("contenteditable") === "true" ||
    element.getAttribute("contenteditable") === "plaintext-only"
  );
}

export function isJevFilterHotkey(event: KeyboardEvent): boolean {
  const hasModifier = isMac() ? event.metaKey : event.ctrlKey;
  return (
    hasModifier &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "f"
  );
}

interface UseJevFilterHotkeyOptions {
  enabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
}

/**
 * Cmd/Ctrl+F opens the Jev filter palette instead of the browser's find, but only when
 * nothing editable is focused, so e.g. the native editor keeps its own find.
 *
 * This is a dedicated listener rather than a kbar shortcut because the shortcuts
 * registry deliberately rejects browser-reserved chords like `$mod+f`.
 */
export function useJevFilterHotkey({
  enabled,
  isOpen,
  onOpen,
}: UseJevFilterHotkeyOptions) {
  const isOpenRef = useLatest(isOpen);
  const onOpenRef = useLatest(onOpen);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isJevFilterHotkey(event)) {
        return;
      }
      if (isOpenRef.current) {
        event.preventDefault();
        return;
      }
      if (isEditableElement(document.activeElement)) {
        return;
      }
      event.preventDefault();
      onOpenRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isOpenRef, onOpenRef]);
}
