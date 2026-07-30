import type { ContentDiagnosticsFilterType } from "metabase-types/api";

export type StaleContentFilterOptions = {
  entityTypes: ContentDiagnosticsFilterType[];
  includePersonalCollections: boolean;
};

export type SlowContentFilterOptions = {
  entityTypes: ContentDiagnosticsFilterType[];
  includePersonalCollections: boolean;
  minDurationMs?: number;
};

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};
