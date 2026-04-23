import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useMemo } from "react";
import * as Y from "yjs";

export type CollabSession = {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
};

function buildWsUrl(): string {
  const { protocol, host } = window.location;
  const scheme = protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${host}/api/document/collab`;
}

/**
 * Open a collab session for a document when the user has write access.
 *
 * `ydoc` + `provider` are constructed synchronously (via `useMemo`) so they're
 * available on the first render — the TipTap editor's `Collaboration`
 * extension needs a `Y.Doc` at mount time. Returns `null` when no session
 * should be opened (read-only viewer, missing entity-id).
 *
 * The backend gates the feature flag. If `MB_ENABLE_DOCUMENT_COLLAB` is off
 * the upgrade returns 404; the provider stays disconnected and the editor
 * silently continues on the non-collab JSON path it already loaded.
 */
export function useCollabProvider(
  entityId: string | null | undefined,
  canWrite: boolean,
): CollabSession | null {
  const session = useMemo<CollabSession | null>(() => {
    if (!entityId || !canWrite) {
      return null;
    }
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: buildWsUrl(),
      name: `document:${entityId}`,
      document: ydoc,
    });
    return { ydoc, provider };
  }, [entityId, canWrite]);

  useEffect(() => {
    if (!session) {
      return;
    }
    return () => {
      try {
        session.provider.destroy();
      } finally {
        session.ydoc.destroy();
      }
    };
  }, [session]);

  return session;
}
