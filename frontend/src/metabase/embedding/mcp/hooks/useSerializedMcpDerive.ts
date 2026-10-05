import { useCallback, useRef } from "react";

import { type DerivedQuery, deriveMcpQuery } from "../api";
import type { McpDeriveOperation } from "../derive";
import {
  getCurrentMcpQueryHandle,
  setCurrentMcpQueryHandle,
} from "../requests";

interface UseSerializedMcpDeriveParams {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
}

/**
 * `deriveQuery` derives a new query from the current handle and makes the new
 * handle current. Derives run one after another, so each change starts from
 * the handle the previous one produced. A failed derive rejects its own
 * promise and leaves the current handle as it was. `pendingDerivesRef` counts
 * the derives that have not finished.
 */
export function useSerializedMcpDerive({
  instanceUrl,
  uiCredential,
  mcpSessionId,
}: UseSerializedMcpDeriveParams) {
  const lastDeriveRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingDerivesRef = useRef(0);

  const deriveQuery = useCallback(
    (operations: McpDeriveOperation[]): Promise<DerivedQuery> => {
      pendingDerivesRef.current += 1;

      const derive = lastDeriveRef.current.then(async () => {
        // Read inside the chained step: the previous derive may have moved it.
        const queryHandle = getCurrentMcpQueryHandle();

        if (!instanceUrl || !uiCredential || !mcpSessionId || !queryHandle) {
          throw new Error("The query cannot be changed here.");
        }

        const derived = await deriveMcpQuery({
          instanceUrl,
          uiCredential,
          mcpSessionId,
          queryHandle,
          operations,
        });

        setCurrentMcpQueryHandle(derived.handle);

        return derived;
      });

      // A failure is the caller's to report; it must not stop later derives.
      lastDeriveRef.current = derive.catch(() => undefined);

      return derive.finally(() => {
        pendingDerivesRef.current -= 1;
      });
    },
    [instanceUrl, mcpSessionId, uiCredential],
  );

  return { deriveQuery, pendingDerivesRef };
}
