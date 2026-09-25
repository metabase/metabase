import { useEffect } from "react";
import { useLatest } from "react-use";

export function isEditableElement(element: Element | null): boolean {
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

/**
 * Ctrl or Cmd on any platform: people reach for Ctrl+F/J on a Mac too, and the palettes never open
 * while an editable element is focused, so Ctrl doesn't collide with text-editing shortcuts there.
 */
export function hasPaletteModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey !== event.metaKey;
}

export function isJevFilterHotkey(event: KeyboardEvent): boolean {
  return (
    hasPaletteModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "f"
  );
}

interface UseJevHotkeyOptions {
  enabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
  isHotkey: (event: KeyboardEvent) => boolean;
}

/**
 * Opens a Jev palette on a chord, but only when nothing editable is focused, so
 * e.g. the native editor keeps its own shortcuts.
 *
 * This is a dedicated listener rather than a kbar shortcut because the shortcuts
 * registry deliberately rejects browser-reserved chords like `$mod+f`.
 */
export function useJevHotkey({
  enabled,
  isOpen,
  onOpen,
  isHotkey,
}: UseJevHotkeyOptions) {
  const isOpenRef = useLatest(isOpen);
  const onOpenRef = useLatest(onOpen);
  const isHotkeyRef = useLatest(isHotkey);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isHotkeyRef.current(event)) {
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
  }, [enabled, isOpenRef, onOpenRef, isHotkeyRef]);
}

type UseJevFilterHotkeyOptions = Omit<UseJevHotkeyOptions, "isHotkey">;

/** Cmd/Ctrl+F opens the Jev filter palette instead of the browser's find. */
export function useJevFilterHotkey(options: UseJevFilterHotkeyOptions) {
  useJevHotkey({ ...options, isHotkey: isJevFilterHotkey });
}
