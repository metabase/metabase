import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { CardDisplayType } from "metabase-types/api";

import { hintDecision, resolveLegacyDefault } from "./shared";
import type {
  VizDecision,
  VizHeuristic,
  VizHeuristicId,
  VizInput,
} from "./types";

export type VizReport = {
  tileId: string;
  title?: string;
  display: CardDisplayType;
  hintDisplay?: CardDisplayType;
  heuristicId: VizHeuristicId;
};

interface VizHeuristicContextValue {
  heuristic: VizHeuristic;
  report: (report: VizReport) => void;
}

const VizHeuristicContext = createContext<VizHeuristicContextValue | null>(
  null,
);

interface VizHeuristicProviderProps {
  heuristic: VizHeuristic;
  onReport?: (report: VizReport) => void;
  children: ReactNode;
}

export function VizHeuristicProvider({
  heuristic,
  onReport,
  children,
}: VizHeuristicProviderProps) {
  // Kept in a ref so an inline `onReport` doesn't re-fire every tile's report
  // on each render. Layout effects run before the tiles' passive effects, so
  // a report in the same commit sees the latest callback.
  const onReportRef = useRef(onReport);
  useLayoutEffect(() => {
    onReportRef.current = onReport;
  });
  const report = useCallback(
    (tileReport: VizReport) => onReportRef.current?.(tileReport),
    [],
  );
  const value = useMemo(() => ({ heuristic, report }), [heuristic, report]);

  return (
    <VizHeuristicContext.Provider value={value}>
      {children}
    </VizHeuristicContext.Provider>
  );
}

/** null outside a provider. */
export function useVizHeuristic(): VizHeuristicContextValue | null {
  return useContext(VizHeuristicContext);
}

/** Outside a provider: exactly what the renderer would have picked. */
function resolveWithoutHeuristic(input: VizInput): VizDecision {
  return input.hint ? hintDecision(input) : resolveLegacyDefault(input);
}

/**
 * Inside a provider: the heuristic's decision, reported to the provider.
 * Outside: the hint (today's behaviour), or the legacy default without one.
 */
export function useResolvedDisplay(
  tileId: string,
  input: VizInput,
  title?: string,
): VizDecision {
  const context = useVizHeuristic();
  const heuristic = context?.heuristic ?? null;
  const report = context?.report ?? null;
  const {
    cols,
    rows,
    query,
    dimensionType,
    hint,
    allowed,
    context: vizContext,
  } = input;
  const hintDisplay = hint?.display;
  const hintSettings = hint?.settings;

  const decision = useMemo(() => {
    const stableInput: VizInput = {
      cols,
      rows,
      query,
      dimensionType,
      hint: hintDisplay
        ? { display: hintDisplay, settings: hintSettings }
        : undefined,
      allowed,
      context: vizContext,
    };
    return heuristic
      ? heuristic.resolve(stableInput)
      : resolveWithoutHeuristic(stableInput);
  }, [
    heuristic,
    cols,
    rows,
    query,
    dimensionType,
    hintDisplay,
    hintSettings,
    allowed,
    vizContext,
  ]);

  const { display } = decision;
  useEffect(() => {
    if (heuristic && report) {
      report({
        tileId,
        title,
        display,
        hintDisplay,
        heuristicId: heuristic.id,
      });
    }
  }, [heuristic, report, tileId, title, display, hintDisplay]);

  return decision;
}
