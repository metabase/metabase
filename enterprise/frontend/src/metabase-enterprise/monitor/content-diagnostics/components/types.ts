import {
  CONTENT_DIAGNOSTICS_IMBALANCED_FINDING_TYPES,
  type ContentDiagnosticsFilterType,
  type ContentDiagnosticsNonCollectionFilterType,
} from "metabase-types/api";

export type ContentDiagnosticsBaseFilterOptions<
  T extends ContentDiagnosticsFilterType =
    ContentDiagnosticsNonCollectionFilterType,
> = {
  entityTypes: T[];
  includePersonalCollections: boolean;
};

export type StaleContentFilterOptions = ContentDiagnosticsBaseFilterOptions & {
  thresholdDays?: number;
};

export type SlowContentFilterOptions = ContentDiagnosticsBaseFilterOptions & {
  minDurationMs?: number;
};

export type DuplicatedContentFilterOptions =
  ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType> & {
    minDuplicateCount?: number;
  };

export type ImbalancedContentFilterOptions =
  ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType>;

export type ContentDiagnosticsParamsOptions = {
  withSetLastUsedParams?: boolean;
};

/** `duplicated` is an umbrella tab over the duplicated finding types. */
export const CONTENT_DIAGNOSTICS_TABS = [
  "stale",
  "slow",
  "duplicated",
  ...CONTENT_DIAGNOSTICS_IMBALANCED_FINDING_TYPES,
] as const;
export type ContentDiagnosticsTab = (typeof CONTENT_DIAGNOSTICS_TABS)[number];

export type ContentDiagnosticsFilterDimension =
  | "entity_type"
  | "personal_collections"
  | "threshold";

export type ContentDiagnosticsFilterPickerProps<TOptions> = {
  filterOptions: TOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  canReset?: boolean;
  onFilterOptionsChange: (filterOptions: TOptions) => void;
  onReset: () => void;
};

export type ContentDiagnosticsFilterBarProps<TOptions> = {
  query?: string;
  filterOptions: TOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: TOptions) => void;
  onReset: () => void;
};
