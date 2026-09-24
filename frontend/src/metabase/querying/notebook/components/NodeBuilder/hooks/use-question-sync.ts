import { useCallback, useEffect, useRef } from "react";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import type { CompiledGraph } from "../graph";

type Options = {
  compiled: CompiledGraph;
  question: Question;
  updateQuestion: (question: Question) => Promise<void>;
  isEnabled: boolean;
};

// Pushes the compiled query to the question when it actually differs. The
// last pushed MBQL is remembered so a round trip through the question can
// never ping-pong.
export function useQuestionSync({
  compiled,
  question,
  updateQuestion,
  isEnabled,
}: Options) {
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isEnabled || !compiled.query) {
      return;
    }
    const next = JSON.stringify(Lib.toLegacyQuery(compiled.query));
    if (next === lastSyncedRef.current) {
      return;
    }
    const current = JSON.stringify(Lib.toLegacyQuery(question.query()));
    lastSyncedRef.current = next;
    if (next !== current) {
      updateQuestion(question.setQuery(compiled.query));
    }
  }, [compiled, question, updateQuestion, isEnabled]);

  // For queries pushed by other means, so the next compile does not push them again.
  const markSynced = useCallback((query: Lib.Query) => {
    lastSyncedRef.current = JSON.stringify(Lib.toLegacyQuery(query));
  }, []);

  return { markSynced };
}
