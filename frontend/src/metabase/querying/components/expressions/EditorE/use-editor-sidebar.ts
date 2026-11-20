import { useCallback, useEffect, useId, useState } from "react";
import { useLatest } from "react-use";

import {
  type ExpressionSidebarName,
  useExpressionSidebarHost,
} from "../ExpressionSidebar";

/**
 * Which sidebar the editor shows, and where. It uses the page's right-hand
 * sidebar when there is one: always for the inline editor, and for a popover
 * editor while the sidebar's slot is on the page (the notebook). Otherwise the
 * editor shows the sidebar in its own layout.
 *
 * The page's sidebar shows the panel of the editor that opened it last, and
 * closes when that editor goes away.
 */
export function useEditorSidebar({ inline }: { inline?: boolean }) {
  const editorId = useId();
  const [localSidebar, setLocalSidebar] =
    useState<ExpressionSidebarName | null>(null);

  const sidebarHost = useExpressionSidebarHost();
  const host = inline || sidebarHost?.container != null ? sidebarHost : null;

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
