import { createContext, useContext, useEffect } from "react";

export const ShortcutBlockerContext = createContext<(() => () => void) | null>(
  null,
);

export function useBlockShortcuts(blocked: boolean) {
  const blockShortcuts = useContext(ShortcutBlockerContext);
  useEffect(() => {
    if (blocked) {
      return blockShortcuts?.();
    }
  }, [blocked, blockShortcuts]);
}
