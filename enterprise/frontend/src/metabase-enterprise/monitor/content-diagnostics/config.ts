import {
  type UrlStateConfig,
  type UrlStateQuery,
  getAllParamValues,
  getFirstParamValue,
  parsePage,
  parseSortColumn,
  parseSortDirection,
} from "metabase/common/hooks/use-url-state";
import * as Urls from "metabase/urls";
import {
  CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
  CONTENT_DIAGNOSTICS_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
  CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
  CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
  type ContentDiagnosticsFilterType,
  type ContentDiagnosticsImbalancedFindingType,
  type ContentDiagnosticsImbalancedSortColumn,
  type SortDirection,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "./components/constants";
import { areEntityTypesEqual } from "./components/utils";

type ContentDiagnosticsParams<
  TEntityType extends ContentDiagnosticsFilterType,
  TSortColumn extends string,
  TThresholdParam extends string,
> = {
  page?: number;
  query?: string;
  entityTypes?: TEntityType[];
  includePersonalCollections?: boolean;
  sortColumn?: TSortColumn;
  sortDirection?: SortDirection;
} & Partial<Record<TThresholdParam, number>>;

type ContentDiagnosticsFilterOptions<
  TEntityType extends ContentDiagnosticsFilterType,
  TThresholdParam extends string,
> = {
  entityTypes: TEntityType[];
  includePersonalCollections: boolean;
} & Partial<Record<TThresholdParam, number>>;

type ContentDiagnosticsUserParams<
  TEntityType extends ContentDiagnosticsFilterType,
  TSortColumn extends string,
  TThresholdUserParam extends string,
> = {
  entity_types?: TEntityType[];
  include_personal_collections?: boolean;
  sort_column?: TSortColumn;
  sort_direction?: SortDirection;
} & Partial<Record<TThresholdUserParam, number>>;

type ThresholdConfig<
  TThresholdParam extends string,
  TThresholdUserParam extends string,
> = {
  paramKey: TThresholdParam;
  urlKey: string;
  userKey: TThresholdUserParam;
};

type CreateContentDiagnosticsConfigOptions<
  TKey extends string,
  TEntityType extends ContentDiagnosticsFilterType,
  TSortColumn extends string,
  TThresholdParam extends string,
  TThresholdUserParam extends string,
> = {
  key: TKey;
  entityTypes: readonly TEntityType[];
  sortColumns: readonly TSortColumn[];
  threshold?: ThresholdConfig<TThresholdParam, TThresholdUserParam>;
};

export function createContentDiagnosticsConfig<
  const TKey extends string,
  TEntityType extends ContentDiagnosticsFilterType,
  TSortColumn extends string,
  TThresholdParam extends string = never,
  TThresholdUserParam extends string = never,
>({
  key,
  entityTypes,
  sortColumns,
  threshold,
}: CreateContentDiagnosticsConfigOptions<
  TKey,
  TEntityType,
  TSortColumn,
  TThresholdParam,
  TThresholdUserParam
>) {
  type Params = ContentDiagnosticsParams<
    TEntityType,
    TSortColumn,
    TThresholdParam
  >;
  type FilterOptions = ContentDiagnosticsFilterOptions<
    TEntityType,
    TThresholdParam
  >;
  type UserParams = ContentDiagnosticsUserParams<
    TEntityType,
    TSortColumn,
    TThresholdUserParam
  >;

  const isEntityType = (value: unknown): value is TEntityType =>
    typeof value === "string" && entityTypes.some((type) => type === value);

  const parseEntityTypes = (value: unknown): TEntityType[] | undefined => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    return values.length === 0 ? undefined : values.filter(isEntityType);
  };

  const getThresholdParam = (params: Params | FilterOptions) =>
    threshold == null ? undefined : params[threshold.paramKey];

  const thresholdParam = <TKey extends string>(
    paramKey: TKey,
    value: number | undefined,
  ): Partial<Record<TKey, number>> => {
    // TypeScript widens computed object keys to `string`; the key comes from the config.
    return { [paramKey]: value } as Partial<Record<TKey, number>>;
  };

  const withThreshold = <T extends object>(
    params: T,
    value: number | undefined,
  ) =>
    Object.assign<T, Partial<Record<TThresholdParam, number>>>(
      params,
      threshold == null ? {} : thresholdParam(threshold.paramKey, value),
    );

  const getParamsWithoutDefaults = (params: Params): Params => {
    const normalizedParams: Params = {
      ...params,
      page: params.page === 0 ? undefined : params.page,
      entityTypes:
        params.entityTypes != null &&
        areEntityTypesEqual(params.entityTypes, [...entityTypes])
          ? undefined
          : params.entityTypes,
      includePersonalCollections:
        params.includePersonalCollections ===
        DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
          ? undefined
          : params.includePersonalCollections,
    };
    return normalizedParams;
  };

  const parse = (query: UrlStateQuery): Params => {
    return withThreshold(
      {
        page: parsePage(query.page),
        query: Urls.parseStringParam(getFirstParamValue(query.query)),
        entityTypes: parseEntityTypes(getAllParamValues(query["entity-types"])),
        includePersonalCollections: Urls.parseBooleanParam(
          getFirstParamValue(query["include-personal-collections"]),
        ),
        sortColumn: parseSortColumn(query["sort-column"], sortColumns),
        sortDirection: parseSortDirection(query["sort-direction"]),
      },
      threshold == null
        ? undefined
        : Urls.parseNumberParam(getFirstParamValue(query[threshold.urlKey])),
    );
  };

  const serialize = (params: Params): UrlStateQuery => {
    const normalizedParams = getParamsWithoutDefaults(params);
    const query: UrlStateQuery = {
      page:
        normalizedParams.page == null
          ? undefined
          : String(normalizedParams.page),
      query: normalizedParams.query,
      "entity-types": normalizedParams.entityTypes,
      "include-personal-collections":
        normalizedParams.includePersonalCollections == null
          ? undefined
          : String(normalizedParams.includePersonalCollections),
      "sort-column": normalizedParams.sortColumn,
      "sort-direction": normalizedParams.sortDirection,
    };
    if (threshold != null) {
      const value = getThresholdParam(normalizedParams);
      query[threshold.urlKey] = value == null ? undefined : String(value);
    }
    return query;
  };

  const urlState: UrlStateConfig<Params> = { parse, serialize };

  const getDefaultFilterOptions = (): FilterOptions =>
    withThreshold(
      {
        entityTypes: [...entityTypes],
        includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
      },
      undefined,
    );

  const getFilterOptions = (params: Params): FilterOptions =>
    withThreshold(
      {
        entityTypes: params.entityTypes ?? [...entityTypes],
        includePersonalCollections:
          params.includePersonalCollections ??
          DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
      },
      getThresholdParam(params),
    );

  const areFilterOptionsEqual = (a: FilterOptions, b: FilterOptions) =>
    areEntityTypesEqual(a.entityTypes, b.entityTypes) &&
    a.includePersonalCollections === b.includePersonalCollections &&
    getThresholdParam(a) === getThresholdParam(b);

  const getFilterParams = (filterOptions: FilterOptions): Partial<Params> => {
    return withThreshold(
      {
        entityTypes: areEntityTypesEqual(filterOptions.entityTypes, [
          ...entityTypes,
        ])
          ? undefined
          : filterOptions.entityTypes,
        includePersonalCollections:
          filterOptions.includePersonalCollections ===
          DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
            ? undefined
            : filterOptions.includePersonalCollections,
      },
      getThresholdParam(filterOptions),
    );
  };

  const getEntityTypesParam = (values: TEntityType[]) =>
    areEntityTypesEqual(values, [...entityTypes]) ? undefined : values;

  const getUserParams = (params: Params): UserParams => {
    const userParams = {
      entity_types: params.entityTypes,
      include_personal_collections: params.includePersonalCollections,
      sort_column: params.sortColumn,
      sort_direction: params.sortDirection,
    };
    return Object.assign<
      typeof userParams,
      Partial<Record<TThresholdUserParam, number>>
    >(
      userParams,
      threshold == null
        ? {}
        : thresholdParam(threshold.userKey, getThresholdParam(params)),
    );
  };

  const isUserParams = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value != null && !Array.isArray(value);

  const parseUserParams = (value: unknown): Params => {
    if (!isUserParams(value)) {
      return {};
    }
    const userParams = value;
    const thresholdValue =
      threshold == null ? undefined : userParams[threshold.userKey];
    return withThreshold(
      {
        entityTypes: parseEntityTypes(userParams.entity_types),
        includePersonalCollections:
          typeof userParams.include_personal_collections === "boolean"
            ? userParams.include_personal_collections
            : undefined,
        sortColumn: parseSortColumn(
          typeof userParams.sort_column === "string"
            ? userParams.sort_column
            : undefined,
          sortColumns,
        ),
        sortDirection: parseSortDirection(
          typeof userParams.sort_direction === "string"
            ? userParams.sort_direction
            : undefined,
        ),
      },
      typeof thresholdValue === "number" && Number.isFinite(thresholdValue)
        ? thresholdValue
        : undefined,
    );
  };

  const urlParamKeys = [
    "page",
    "query",
    "entity-types",
    "include-personal-collections",
    ...(threshold == null ? [] : [threshold.urlKey]),
    "sort-column",
    "sort-direction",
  ];

  const hasUrlParams = (query: UrlStateQuery) =>
    urlParamKeys.some((key) => query[key] != null);

  return {
    key,
    entityTypes,
    sortColumns,
    urlState,
    getParamsWithoutDefaults,
    getDefaultFilterOptions,
    getFilterOptions,
    areFilterOptionsEqual,
    getFilterParams,
    getEntityTypesParam,
    getUserParams,
    parseUserParams,
    hasUrlParams,
  };
}

export const staleContentConfig = createContentDiagnosticsConfig({
  key: "stale",
  entityTypes: CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  sortColumns: CONTENT_DIAGNOSTICS_STALE_SORT_COLUMNS,
  threshold: {
    paramKey: "thresholdDays",
    urlKey: "threshold-days",
    userKey: "threshold_days",
  },
});

export const slowContentConfig = createContentDiagnosticsConfig({
  key: "slow",
  entityTypes: CONTENT_DIAGNOSTICS_NON_COLLECTION_FILTER_TYPES,
  sortColumns: CONTENT_DIAGNOSTICS_SLOW_SORT_COLUMNS,
  threshold: {
    paramKey: "minDurationMs",
    urlKey: "min-duration-ms",
    userKey: "min_duration_ms",
  },
});

export const duplicatedContentConfig = createContentDiagnosticsConfig({
  key: "duplicated",
  entityTypes: CONTENT_DIAGNOSTICS_FILTER_TYPES,
  sortColumns: CONTENT_DIAGNOSTICS_DUPLICATED_SORT_COLUMNS,
  threshold: {
    paramKey: "minDuplicateCount",
    urlKey: "min-duplicate-count",
    userKey: "min_duplicate_count",
  },
});

const EMPTY_ENTITY_TYPES: ContentDiagnosticsFilterType[] = [
  "question",
  "model",
  "metric",
  "dashboard",
  "document",
  "collection",
];
const SPARSE_ENTITY_TYPES: ContentDiagnosticsFilterType[] = [
  "dashboard",
  "collection",
];
const CROWDED_ENTITY_TYPES: ContentDiagnosticsFilterType[] = [
  "dashboard",
  "document",
  "collection",
];
const CROWDED_SORT_COLUMNS: ContentDiagnosticsImbalancedSortColumn[] =
  CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS.filter(
    (column) => column !== "content-count",
  );

const imbalancedContentConfigs = {
  empty: createContentDiagnosticsConfig({
    key: "empty",
    entityTypes: EMPTY_ENTITY_TYPES,
    sortColumns: CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
  }),
  sparse: createContentDiagnosticsConfig({
    key: "sparse",
    entityTypes: SPARSE_ENTITY_TYPES,
    sortColumns: CONTENT_DIAGNOSTICS_IMBALANCED_SORT_COLUMNS,
  }),
  crowded: createContentDiagnosticsConfig({
    key: "crowded",
    entityTypes: CROWDED_ENTITY_TYPES,
    sortColumns: CROWDED_SORT_COLUMNS,
  }),
};

export function getImbalancedContentConfig(
  mode: ContentDiagnosticsImbalancedFindingType,
) {
  return imbalancedContentConfigs[mode];
}

export type StaleContentParams = ReturnType<
  typeof staleContentConfig.urlState.parse
>;
export type SlowContentParams = ReturnType<
  typeof slowContentConfig.urlState.parse
>;
export type DuplicatedContentParams = ReturnType<
  typeof duplicatedContentConfig.urlState.parse
>;
export type ImbalancedContentParams = ReturnType<
  (typeof imbalancedContentConfigs)[ContentDiagnosticsImbalancedFindingType]["urlState"]["parse"]
>;
