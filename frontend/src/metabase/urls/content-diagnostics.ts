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

export type StaleContentParams = {
  page?: number;
  query?: string;
  entityTypes?: ContentDiagnosticsNonCollectionFilterType[];
  includePersonalCollections?: boolean;
  thresholdDays?: number;
  sortColumn?: ContentDiagnosticsStaleSortColumn;
  sortDirection?: SortDirection;
};

function staleContentQueryString({
  page,
  query,
  entityTypes,
  includePersonalCollections,
  thresholdDays,
  sortColumn,
  sortDirection,
}: StaleContentParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (entityTypes != null) {
    entityTypes.forEach((entityType) => {
      searchParams.append("entity-types", entityType);
    });
  }
  if (includePersonalCollections != null) {
    searchParams.set(
      "include-personal-collections",
      String(includePersonalCollections),
    );
  }
  if (thresholdDays != null) {
    searchParams.set("threshold-days", String(thresholdDays));
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

export function staleContent(params?: StaleContentParams) {
  return `${contentDiagnostics()}/stale${staleContentQueryString(params)}`;
}

export type SlowContentParams = {
  page?: number;
  query?: string;
  entityTypes?: ContentDiagnosticsNonCollectionFilterType[];
  includePersonalCollections?: boolean;
  minDurationMs?: number;
  sortColumn?: ContentDiagnosticsSlowSortColumn;
  sortDirection?: SortDirection;
};

function slowContentQueryString({
  page,
  query,
  entityTypes,
  includePersonalCollections,
  minDurationMs,
  sortColumn,
  sortDirection,
}: SlowContentParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (entityTypes != null) {
    entityTypes.forEach((entityType) => {
      searchParams.append("entity-types", entityType);
    });
  }
  if (includePersonalCollections != null) {
    searchParams.set(
      "include-personal-collections",
      String(includePersonalCollections),
    );
  }
  if (minDurationMs != null) {
    searchParams.set("min-duration-ms", String(minDurationMs));
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

export function slowContent(params?: SlowContentParams) {
  return `${contentDiagnostics()}/slow${slowContentQueryString(params)}`;
}

export type DuplicatedContentParams = {
  page?: number;
  query?: string;
  entityTypes?: ContentDiagnosticsFilterType[];
  includePersonalCollections?: boolean;
  minDuplicateCount?: number;
  sortColumn?: ContentDiagnosticsDuplicatedSortColumn;
  sortDirection?: SortDirection;
};

function duplicatedContentQueryString({
  page,
  query,
  entityTypes,
  includePersonalCollections,
  minDuplicateCount,
  sortColumn,
  sortDirection,
}: DuplicatedContentParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (entityTypes != null) {
    entityTypes.forEach((entityType) => {
      searchParams.append("entity-types", entityType);
    });
  }
  if (includePersonalCollections != null) {
    searchParams.set(
      "include-personal-collections",
      String(includePersonalCollections),
    );
  }
  if (minDuplicateCount != null) {
    searchParams.set("min-duplicate-count", String(minDuplicateCount));
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

export function duplicatedContent(params?: DuplicatedContentParams) {
  return `${contentDiagnostics()}/duplicated${duplicatedContentQueryString(params)}`;
}

export type ImbalancedContentParams = {
  page?: number;
  query?: string;
  entityTypes?: ContentDiagnosticsFilterType[];
  includePersonalCollections?: boolean;
  sortColumn?: ContentDiagnosticsImbalancedSortColumn;
  sortDirection?: SortDirection;
};

function imbalancedContentQueryString({
  page,
  query,
  entityTypes,
  includePersonalCollections,
  sortColumn,
  sortDirection,
}: ImbalancedContentParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (entityTypes != null) {
    entityTypes.forEach((entityType) => {
      searchParams.append("entity-types", entityType);
    });
  }
  if (includePersonalCollections != null) {
    searchParams.set(
      "include-personal-collections",
      String(includePersonalCollections),
    );
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

// The problem type (empty/sparse/crowded) is the route segment, so it doubles as the
// tab identity and the pinned `finding-types` value.
export function imbalancedContent(
  mode: ContentDiagnosticsImbalancedFindingType,
  params?: ImbalancedContentParams,
) {
  return `${contentDiagnostics()}/${mode}${imbalancedContentQueryString(params)}`;
}
