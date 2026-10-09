import type { ConcreteTableId } from "metabase-types/api";

export type EventAnalysisKind =
  | "funnel"
  | "paths"
  | "habit"
  | "lifecycle"
  | "cohorts";

export function newEventAnalysis(): string {
  return "/event-analysis/new";
}

export function eventAnalysis(
  kind: EventAnalysisKind,
  tableId: ConcreteTableId,
): string {
  const params = new URLSearchParams({ table: String(tableId) });
  return `/event-analysis/new/${kind}?${params.toString()}`;
}

export function eventAnalysisDebug(): string {
  return "/event-analysis/debug";
}
