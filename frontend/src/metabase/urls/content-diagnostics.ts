import type {
  ContentDiagnosticsDuplicatedSortColumn,
  ContentDiagnosticsFilterType,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedSortColumn,
  ContentDiagnosticsNonCollectionFilterType,
  ContentDiagnosticsSlowSortColumn,
  ContentDiagnosticsStaleSortColumn,
  SortDirection,
} from "metabase-types/api";

const CONTENT_DIAGNOSTICS_URL = `/monitor/content-diagnostics`;

export function contentDiagnostics() {
  return CONTENT_DIAGNOSTICS_URL;
}

type CommonContentParams<
  TEntityType extends string,
  TSortColumn extends string,
> = {
  page?: number;
  query?: string;
  entityTypes?: TEntityType[];
  includePersonalCollections?: boolean;
  sortColumn?: TSortColumn;
  sortDirection?: SortDirection;
};

export type StaleContentParams = CommonContentParams<
  ContentDiagnosticsNonCollectionFilterType,
  ContentDiagnosticsStaleSortColumn
> & { thresholdDays?: number };

export type SlowContentParams = CommonContentParams<
  ContentDiagnosticsNonCollectionFilterType,
  ContentDiagnosticsSlowSortColumn
> & { minDurationMs?: number };

export type DuplicatedContentParams = CommonContentParams<
  ContentDiagnosticsFilterType,
  ContentDiagnosticsDuplicatedSortColumn
> & { minDuplicateCount?: number };

export type ImbalancedContentParams = CommonContentParams<
  ContentDiagnosticsFilterType,
  ContentDiagnosticsImbalancedSortColumn
>;

function contentDiagnosticsQueryString(
  {
    page,
    query,
    entityTypes,
    includePersonalCollections,
    sortColumn,
    sortDirection,
  }: CommonContentParams<string, string>,
  threshold?: { key: string; value: number | undefined },
) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  entityTypes?.forEach((entityType) => {
    searchParams.append("entity-types", entityType);
  });
  if (includePersonalCollections != null) {
    searchParams.set(
      "include-personal-collections",
      String(includePersonalCollections),
    );
  }
  if (threshold?.value != null) {
    searchParams.set(threshold.key, String(threshold.value));
  }
  if (sortColumn != null) {
    searchParams.set("sort-column", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sort-direction", sortDirection);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function staleContent(params: StaleContentParams = {}) {
  return `${contentDiagnostics()}/stale${contentDiagnosticsQueryString(params, {
    key: "threshold-days",
    value: params.thresholdDays,
  })}`;
}

export function slowContent(params: SlowContentParams = {}) {
  return `${contentDiagnostics()}/slow${contentDiagnosticsQueryString(params, {
    key: "min-duration-ms",
    value: params.minDurationMs,
  })}`;
}

export function duplicatedContent(params: DuplicatedContentParams = {}) {
  return `${contentDiagnostics()}/duplicated${contentDiagnosticsQueryString(
    params,
    {
      key: "min-duplicate-count",
      value: params.minDuplicateCount,
    },
  )}`;
}

// The problem type is the route segment and pins the `finding-types` value.
export function imbalancedContent(
  mode: ContentDiagnosticsImbalancedFindingType,
  params: ImbalancedContentParams = {},
) {
  return `${contentDiagnostics()}/${mode}${contentDiagnosticsQueryString(params)}`;
}
