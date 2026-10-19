import { useEffect } from "react";
import { useLatest } from "react-use";

import type * as Lib from "metabase-lib";

type OnDraftChange = (filter: Lib.ExpressionClause | undefined) => void;

function getStateKey(state: unknown): string {
  return JSON.stringify(state, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

/**
 * Calls `onDraftChange` with the filter that the picker would apply, every time
 * the picker state changes. Pickers build a new clause object on each call, so
 * the state, not the clause, tells when the draft changes.
 */
export function useReportDraftFilter(
  onDraftChange: OnDraftChange | undefined,
  state: unknown,
  getDraftFilter: () => Lib.ExpressionClause | undefined,
) {
  const stateKey = getStateKey(state);
  const getDraftFilterRef = useLatest(getDraftFilter);

  useEffect(() => {
    onDraftChange?.(getDraftFilterRef.current());
  }, [stateKey, onDraftChange, getDraftFilterRef]);
}
