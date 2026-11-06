import type { Analysis } from "metabase-types/api";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAnalysis = (value: unknown): value is Analysis =>
  isRecord(value) &&
  value.version === 1 &&
  value.kind === "habit" &&
  isRecord(value.columns) &&
  isRecord(value.settings);

/** The form a query was built from, if it's an analysis. */
export const getQueryAnalysis = (query: unknown): Analysis | undefined =>
  isRecord(query) && isAnalysis(query.analysis) ? query.analysis : undefined;
