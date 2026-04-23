import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useState } from "react";
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
 * Construction happens in `useEffect` (not `useMemo`) so React 18 Strict
 * Mode's double-invoke of render doesn't leak a `Y.Doc` + in-flight
 * WebSocket attempt on every dev mount — the effect's cleanup runs
 * between the two invocations and tears down any provisional session.
 *
 * Returns `null` while the session is being set up or when no session
 * should be opened (read-only viewer, missing entity-id). Errors
 * (`onAuthenticationFailed` from backend authz, non-normal close codes
 * from flag-off 404 or dropped connection) are surfaced via `console.warn`
 * — the editor still works in non-collab mode when the session fails.
 */
export function useCollabProvider(
  entityId: string | null | undefined,
  canWrite: boolean,
): CollabSession | null {
  const [session, setSession] = useState<CollabSession | null>(null);

  useEffect(() => {
    if (!entityId || !canWrite) {
      return;
    }
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: buildWsUrl(),
      name: `document:${entityId}`,
      document: ydoc,
      onAuthenticationFailed: ({ reason }) => {
        // eslint-disable-next-line no-console
        console.warn(`[collab] authentication failed: ${reason}`);
      },
      onClose: ({ event }) => {
        if (event.code !== 1000) {
          // eslint-disable-next-line no-console
          console.warn(
            `[collab] connection closed: code=${event.code} reason=${event.reason}`,
          );
        }
      },
    });
    setSession({ ydoc, provider });
    return () => {
      provider.destroy();
      ydoc.destroy();
      setSession(null);
    };
  }, [entityId, canWrite]);

  return session;
}
