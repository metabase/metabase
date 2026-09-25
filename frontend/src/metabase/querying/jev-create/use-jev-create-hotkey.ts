import {
  hasPaletteModifier,
  useJevHotkey,
} from "metabase/querying/jev-filters/use-jev-filter-hotkey";
import { isMac } from "metabase/utils/browser";

export function isJevCreateHotkey(event: KeyboardEvent): boolean {
  return (
    hasPaletteModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "j"
  );
}

export function getJevCreateHotkeyLabel(): string {
  return isMac() ? "⌘J" : "Ctrl+J";
}

interface UseJevCreateHotkeyOptions {
  enabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
}

/** Cmd/Ctrl+J opens "New with Jev" (and stops browsers opening their downloads). */
export function useJevCreateHotkey(options: UseJevCreateHotkeyOptions) {
  useJevHotkey({ ...options, isHotkey: isJevCreateHotkey });
}
