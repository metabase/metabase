import type { ContentDiagnosticsFilterType } from "metabase-types/api";

export type ContentDiagnosticsFilterOptions = {
  entityTypes: ContentDiagnosticsFilterType[];
  includePersonalCollections: boolean;
};

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};
