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
  const [generateSql, { isLoading }] = useGenerateSqlMutation();
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
        setError(t`Something went wrong. Please try again.`);
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
    clear();
    setError(undefined);
  }, [clear]);

  const reject = useCallback(() => {
    // no-op for OSS - upgrade to enterprise if you want the agent to be smarter after rejecting an edit!
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
