import type {
  ContentDiagnosticsCoveredFilterType,
  ContentDiagnosticsFilterType,
} from "metabase-types/api";

export type ContentDiagnosticsBaseFilterOptions<
  T extends ContentDiagnosticsFilterType = ContentDiagnosticsCoveredFilterType,
> = {
  entityTypes: T[];
  includePersonalCollections: boolean;
};

export type StaleContentFilterOptions = ContentDiagnosticsBaseFilterOptions;

export type SlowContentFilterOptions = ContentDiagnosticsBaseFilterOptions & {
  minDurationMs?: number;
};

export type DuplicatedContentFilterOptions =
  ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType> & {
    minDuplicateCount?: number;
  };

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};
