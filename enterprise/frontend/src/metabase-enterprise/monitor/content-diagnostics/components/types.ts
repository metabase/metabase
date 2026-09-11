import type {
  ContentDiagnosticsFilterType,
  ContentDiagnosticsNonCollectionFilterType,
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
