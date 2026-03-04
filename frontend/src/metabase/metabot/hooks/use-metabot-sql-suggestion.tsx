import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useGenerateSqlMutation } from "metabase/api";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import type {
  DatabaseId,
  GenerateSqlResponse,
  ReferencedEntity,
} from "metabase-types/api";

export interface UseMetabotSQLSuggestionOptions {
  databaseId: DatabaseId | null;
  bufferId: string;
  onGenerated?: (result?: GenerateSqlResponse) => void;
}

export function useMetabotSQLSuggestion({
  databaseId,
  onGenerated,
}: UseMetabotSQLSuggestionOptions) {
  const [source, setSource] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [generateSql, { isLoading }] = useGenerateSqlMutation();
  const requestRef = useRef<ReturnType<typeof generateSql> | null>(null);

  const generate = useCallback(
    async ({
      prompt,
      sourceSql,
      referencedEntities,
    }: {
      prompt: string;
      sourceSql?: string;
      referencedEntities?: ReferencedEntity[];
    }) => {
      if (!databaseId) {
        const errText = t`No database selected.`;
        setError(errText);
        throw new Error(errText);
      }
      setError(undefined);
      try {
        const request = generateSql({
          prompt,
          database_id: databaseId,
          source_sql: sourceSql,
          referenced_entities: referencedEntities,
        });
        requestRef.current = request;
        const result = await request.unwrap();
        requestRef.current = null;

        if (result.sql) {
          setSource(result.sql);
          onGenerated?.(result);
        } else {
          throw new Error(t`Something went wrong. Please try again.`);
        }
      } catch (err) {
        const error = err as { status?: number; data?: unknown };
        let errText = t`Something went wrong. Please try again.`;
        if (error.status === 400 && typeof error.data === "string") {
          errText = error.data;
        }
        setError(errText);
        throw new Error(errText);
      }
    },
    [generateSql, databaseId, onGenerated],
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

  const suggestionModels: SuggestionModel[] = useMemo(() => ["table"], []);

  return {
    source,
    isLoading,
    generate,
    error,
    cancelRequest,
    clear,
    reject,
    reset,
    suggestionModels,
  };
}
