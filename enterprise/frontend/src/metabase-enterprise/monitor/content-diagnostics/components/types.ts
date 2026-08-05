import type { ContentDiagnosticsFilterType } from "metabase-types/api";

export type ContentDiagnosticsBaseFilterOptions = {
  entityTypes: ContentDiagnosticsFilterType[];
  includePersonalCollections: boolean;
};

export type StaleContentFilterOptions = ContentDiagnosticsBaseFilterOptions;

export type SlowContentFilterOptions = ContentDiagnosticsBaseFilterOptions & {
  minDurationMs?: number;
};

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};
