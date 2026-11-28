import { useKBar } from "kbar";
import { type PropsWithChildren, useCallback, useRef } from "react";

import { ShortcutBlockerContext } from "metabase/ui/hooks/use-block-shortcuts";

export function PaletteShortcutProvider({ children }: PropsWithChildren) {
  const { query } = useKBar();
  const blockers = useRef(0);
  const blockShortcuts = useCallback(() => {
    if (blockers.current++ === 0) {
      query.disable(true);
    }
    return () => {
      if (--blockers.current === 0) {
        query.disable(false);
      }
    };
  }, [query]);

  return (
    <ShortcutBlockerContext.Provider value={blockShortcuts}>
      {children}
    </ShortcutBlockerContext.Provider>
  );
}
