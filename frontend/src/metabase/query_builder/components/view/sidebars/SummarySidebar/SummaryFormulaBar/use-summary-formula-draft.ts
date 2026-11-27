import { useCallback, useEffect, useRef, useState } from "react";

import { useFormulaBarOwnership } from "../../../FormulaBar";

import type { SummaryFormulaDraft, SummaryFormulaOriginal } from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export function useSummaryFormulaDraft(onReset: () => void) {
  const ownership = useFormulaBarOwnership();
  const [draft, setDraft] = useState<SummaryFormulaDraft | null>(null);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Clears the draft. A formula still loading for the cleared draft no longer lands in the bar. */
  const reset = useCallback(() => {
    nextKey.current += 1;
    onReset();
    setDraft(null);
  }, [onReset]);

  useEffect(() => {
    if (!ownership.isActive) {
      reset();
    }
  }, [ownership.isActive, reset]);

  const releaseOwnership = ownership.close;
  const close = useCallback(() => {
    reset();
    releaseOwnership();
    if (inputRef.current?.isConnected) {
      inputRef.current.focus();
    }
  }, [reset, releaseOwnership]);

  /** Opens the bar with a new draft, and returns the draft's key. */
  const open = (
    input: HTMLInputElement | null,
    nextDraft: DistributiveOmit<SummaryFormulaDraft, "key">,
  ) => {
    reset();
    inputRef.current = input;
    const key = nextKey.current;
    setDraft({ ...nextDraft, key });
    ownership.open();
    return key;
  };

  const isCurrent = (key: number) => nextKey.current === key;

  const updateEditOriginal = (key: number, original: SummaryFormulaOriginal) =>
    setDraft((draft) =>
      draft?.kind === "edit" && draft.key === key
        ? { ...draft, original }
        : draft,
    );

  return {
    draft,
    isActive: ownership.isActive,
    open,
    close,
    isCurrent,
    updateEditOriginal,
  };
}
