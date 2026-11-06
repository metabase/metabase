import { useState } from "react";
import { msgid, ngettext } from "ttag";

import {
  type PrototypeRuntimeEstimate,
  skipToken,
  useGetPrototypeRuntimeEstimateQuery,
} from "metabase/api";
import { SHOW_RUNTIME_ESTIMATE, usePrototypeSetting } from "metabase/prototype";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

/** Below this, a query is fast enough that the user does not need a hint. */
const MIN_ESTIMATE_MS = 1000;

/**
 * Prototype: a hint like "Usually takes about 10 seconds", from the past runs
 * of the question. A changed saved question uses the runs of the saved
 * question. Other questions use the runs of all queries on their source
 * table. Null for fast questions and questions with too few runs.
 */
export function useRuntimeEstimateHint(
  question: Question,
  isRunning: boolean,
): string | null {
  const [isEnabled] = usePrototypeSetting(SHOW_RUNTIME_ESTIMATE);
  const cardId = question.id() ?? question.card().original_card_id;
  const sourceId = Lib.sourceTableOrCardId(question.query());
  const tableId = typeof sourceId === "number" ? sourceId : undefined;
  const hasSource = cardId != null || tableId != null;
  const { data, refetch } = useGetPrototypeRuntimeEstimateQuery(
    isEnabled && hasSource
      ? { "card-id": cardId, "table-id": tableId }
      : skipToken,
  );

  // Each run adds to the history, so the estimate updates after it.
  const [wasRunning, setWasRunning] = useState(isRunning);
  if (wasRunning !== isRunning) {
    setWasRunning(isRunning);
    if (!isRunning && isEnabled && hasSource) {
      refetch();
    }
  }

  return isEnabled && data != null ? getHint(data) : null;
}

function getHint(estimate: PrototypeRuntimeEstimate): string | null {
  if (estimate.basis == null || estimate.p50_ms < MIN_ESTIMATE_MS) {
    return null;
  }
  const seconds = Math.round(estimate.p50_ms / 1000);
  if (seconds < 90) {
    return ngettext(
      msgid`Usually takes about ${seconds} second`,
      `Usually takes about ${seconds} seconds`,
      seconds,
    );
  }
  const minutes = Math.round(seconds / 60);
  return ngettext(
    msgid`Usually takes about ${minutes} minute`,
    `Usually takes about ${minutes} minutes`,
    minutes,
  );
}
