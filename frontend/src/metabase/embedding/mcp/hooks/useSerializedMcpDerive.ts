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
 * `deriveQuery(operations, apply)` derives a new query from the current
 * handle, makes the new handle current, and calls `apply` with the result so
 * the chart shows it. Derives run one after another, so each change starts
 * from the handle the previous one produced.
 *
 * The current handle always names the query the chart shows: a failed
 * derive, or an `apply` that throws, leaves or puts back the old handle. A
 * derive whose base handle was replaced while it was in flight, for example by
 * a new tool result, rejects with `isStale: true` and applies nothing.
 * `pendingDerivesRef` counts the derives that have not finished.
 */
export function useSerializedMcpDerive({
  instanceUrl,
  uiCredential,
  mcpSessionId,
}: UseSerializedMcpDeriveParams) {
  const lastDeriveRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingDerivesRef = useRef(0);

  const deriveQuery = useCallback(
    (
      operations: McpDeriveOperation[],
      apply: (derived: DerivedQuery) => void,
    ): Promise<DerivedQuery> => {
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

        if (getCurrentMcpQueryHandle() !== queryHandle) {
          throw Object.assign(
            new Error("The query changed while this change was in flight."),
            { isStale: true },
          );
        }

        // The question re-runs through the current handle, so it moves first.
        setCurrentMcpQueryHandle(derived.handle);

        try {
          apply(derived);
        } catch (error) {
          setCurrentMcpQueryHandle(queryHandle);
          throw error;
        }

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
