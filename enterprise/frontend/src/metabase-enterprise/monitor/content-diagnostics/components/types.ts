import type { ContentDiagnosticsFilterType } from "metabase-types/api";

export type StaleContentFilterOptions = {
  entityTypes: ContentDiagnosticsFilterType[];
  includePersonalCollections: boolean;
};

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};
