import type {
  ContentDiagnosticsFilterType,
  ContentDiagnosticsSortColumn,
  SortDirection,
} from "metabase-types/api";

const CONTENT_DIAGNOSTICS_URL = `/monitor/content-diagnostics`;

export function contentDiagnostics() {
  return CONTENT_DIAGNOSTICS_URL;
}

export type ContentDiagnosticsParams = {
  page?: number;
  query?: string;
  entityTypes?: ContentDiagnosticsFilterType[];
  includePersonalCollections?: boolean;
  sortColumn?: ContentDiagnosticsSortColumn;
  sortDirection?: SortDirection;
};

function contentDiagnosticsQueryString({
  page,
  query,
  entityTypes,
  includePersonalCollections,
  sortColumn,
  sortDirection,
}: ContentDiagnosticsParams = {}) {
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

export function staleContent(params?: ContentDiagnosticsParams) {
  return `${contentDiagnostics()}/stale${contentDiagnosticsQueryString(params)}`;
}
