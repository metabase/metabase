import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useGenerateSqlMutation } from "metabase/api";
import type { DatabaseId } from "metabase-types/api";

export function useMetabotSQLSuggestion(
  databaseId: DatabaseId | null,
  bufferId: string,
) {
  const [source, setSource] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [generateSql, { isLoading, reset: resetMutation }] =
    useGenerateSqlMutation();
  const requestRef = useRef<ReturnType<typeof generateSql> | null>(null);

  const generate = useCallback(
    async (prompt: string) => {
      if (!databaseId) {
        setError(t`No database selected.`);
        return;
      }
      setError(undefined);
      try {
        const request = generateSql({
          prompt,
          database_id: databaseId,
          buffer_id: bufferId,
        });
        requestRef.current = request;
        const result = await request.unwrap();
        requestRef.current = null;

        const codeEdit = result.parts.find((p) => p.type === "code_edit");
        if (codeEdit?.value?.value) {
          setSource(codeEdit.value.value);
        } else {
          setError(t`Something went wrong. Please try again.`);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError(t`Something went wrong. Please try again.`);
        }
      }
    },
    [generateSql, bufferId, databaseId],
  );

  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const clear = useCallback(() => {
    setSource(undefined);
  }, []);

  const reset = useCallback(() => {
    setSource(undefined);
    setError(undefined);
    resetMutation();
  }, [resetMutation]);

  const reject = useCallback(() => {
    // No-op for OSS (enterprise sends feedback to agent)
  }, []);

  return {
    source,
    isLoading,
    generate,
    error,
    cancelRequest,
    clear,
    reject,
    reset,
  };
}
