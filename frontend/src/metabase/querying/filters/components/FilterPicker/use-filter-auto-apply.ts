import {
  type FocusEvent,
  type HTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";

import type * as Lib from "metabase-lib";

import { FilterAutoApplyContext } from "./FilterAutoApplyContext";
import type { FilterChangeOpts } from "./types";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
]);

interface UseFilterAutoApplyOpts {
  query: Lib.Query;
  stageIndex: number;
  filter?: Lib.Filterable;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  onClose?: () => void;
}

interface FilterAutoApply {
  isActive: boolean;
  onDraftChange: (filter: Lib.ExpressionClause | undefined) => void;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  containerProps: HTMLAttributes<HTMLElement>;
}

/**
 * Prototype: applies the draft filter of a picker to the question as the user
 * changes it, when [[FilterAutoApplyContext]] is enabled for the query.
 * Clicks and selections apply immediately. Typed values apply after a pause or
 * on blur, as the context says. A pending change applies when the picker
 * closes.
 */
export function useFilterAutoApply({
  query,
  stageIndex,
  filter,
  onChange,
  onClose,
}: UseFilterAutoApplyOpts): FilterAutoApply {
  const autoApply = useContext(FilterAutoApplyContext);
  // After each apply, the picker gets the new query and filter. A draft
  // replaces the filter in the query from the time the picker opened, so that
  // the picker never adds the same filter twice.
  const [initial] = useState(() => ({ query, stageIndex, filter }));
  const [isActive] = useState(
    () => autoApply?.isEnabled(initial.query) ?? false,
  );
  const autoApplyRef = useLatest(autoApply);
  const pendingDraftRef = useRef<Lib.ExpressionClause | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // Pickers report their initial state as a draft too. Only changes that the
  // user makes apply.
  const hasInteractedRef = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timeoutRef.current);
    pendingDraftRef.current = null;
  }, []);

  const apply = useCallback(
    (draftFilter: Lib.ExpressionClause) => {
      autoApplyRef.current?.apply({ ...initial, draftFilter });
    },
    [autoApplyRef, initial],
  );

  const flush = useCallback(() => {
    const draftFilter = pendingDraftRef.current;
    cancel();
    if (draftFilter != null) {
      apply(draftFilter);
    }
  }, [apply, cancel]);

  useEffect(() => flush, [flush]);

  const handleDraftChange = useCallback(
    (draftFilter: Lib.ExpressionClause | undefined) => {
      const autoApply = autoApplyRef.current;
      if (!isActive || autoApply == null || !hasInteractedRef.current) {
        return;
      }
      cancel();
      if (draftFilter == null) {
        return;
      }
      pendingDraftRef.current = draftFilter;
      if (!isTextEntry(document.activeElement)) {
        flush();
      } else if (autoApply.typedValuesApplyMode === "pause") {
        timeoutRef.current = setTimeout(flush, autoApply.typingPauseMs);
      }
    },
    [isActive, autoApplyRef, cancel, flush],
  );

  const handleChange = (
    filter: Lib.ExpressionClause,
    opts: FilterChangeOpts,
  ) => {
    cancel();
    if (isActive && onClose != null) {
      apply(filter);
      onClose();
    } else {
      // Without `onClose`, the caller replaces the filter it got in props,
      // which is the applied one, so its own change does not add a filter.
      onChange(filter, opts);
    }
  };

  const markInteracted = () => {
    hasInteractedRef.current = true;
  };

  const containerProps: HTMLAttributes<HTMLElement> = isActive
    ? {
        onPointerDownCapture: markInteracted,
        onKeyDownCapture: markInteracted,
        onBlur: (event: FocusEvent<HTMLElement>) => {
          if (isTextEntry(event.target)) {
            flush();
          }
        },
      }
    : {};

  return {
    isActive,
    onDraftChange: handleDraftChange,
    onChange: handleChange,
    containerProps,
  };
}

function isTextEntry(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly;
  }
  if (element instanceof HTMLInputElement) {
    return !element.readOnly && !NON_TEXT_INPUT_TYPES.has(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}
