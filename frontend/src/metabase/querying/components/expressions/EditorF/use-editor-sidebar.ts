import { useCallback, useEffect, useId, useState } from "react";
import { useLatest } from "react-use";

import {
  type ExpressionSidebarName,
  useExpressionSidebarHost,
} from "../ExpressionSidebar";

/**
 * Which sidebar the editor shows, and where. It uses the page's right-hand
 * sidebar when the page has one. Otherwise the editor shows the sidebar in its
 * own layout.
 *
 * The page's sidebar shows the panel of the editor that opened it last, and
 * closes when that editor goes away.
 */
export function useEditorSidebar() {
  const editorId = useId();
  const [localSidebar, setLocalSidebar] =
    useState<ExpressionSidebarName | null>(null);

  const host = useExpressionSidebarHost();

  const hostSidebar = host?.owner === editorId ? host.openSidebar : null;
  const openSidebar = host ? hostSidebar : localSidebar;

  const setOpenSidebar = useCallback(
    (name: ExpressionSidebarName | null) => {
      if (host) {
        host.setOwner(name != null ? editorId : null);
        host.setOpenSidebar(name);
      } else {
        setLocalSidebar(name);
      }
    },
    [host, editorId],
  );

  const hostRef = useLatest(host);
  useEffect(
    () => () => {
      const host = hostRef.current;
      if (host?.owner === editorId) {
        host.setOwner(null);
        host.setOpenSidebar(null);
      }
    },
    [hostRef, editorId],
  );

  return { host, openSidebar, setOpenSidebar };
}
