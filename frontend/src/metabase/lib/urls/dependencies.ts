import type {
  DependencyEntry,
  DependencyGroupType,
  DependencySortColumn,
  DependencySortDirection,
} from "metabase-types/api";

const BASE_URL = `/data-studio`;
const GRAPH_URL = `${BASE_URL}/dependencies`;
const DIAGNOSTICS_URL = `${BASE_URL}/dependency-diagnostics`;

export type DependencyGraphParams = {
  entry?: DependencyEntry;
  baseUrl?: string;
};

export function dependencyGraph({
  entry,
  baseUrl = GRAPH_URL,
}: DependencyGraphParams = {}) {
  const searchParams = new URLSearchParams();
  if (entry != null) {
    searchParams.set("id", String(entry.id));
    searchParams.set("type", entry.type);
  }
  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${baseUrl}?${queryString}` : baseUrl;
}

export function dependencyDiagnostics() {
  return DIAGNOSTICS_URL;
}

export type DependencyListParams = {
  page?: number;
  query?: string;
  groupTypes?: DependencyGroupType[];
  includePersonalCollections?: boolean;
  sortColumn?: DependencySortColumn;
  sortDirection?: DependencySortDirection;
};

function dependencyListQueryString({
  page,
  query,
  groupTypes,
  includePersonalCollections,
  sortColumn,
  sortDirection,
}: DependencyListParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (groupTypes != null) {
    groupTypes.forEach((groupType) => {
      searchParams.append("group_types", groupType);
    });
  }
  if (includePersonalCollections != null) {
    searchParams.set(
      "include_personal_collections",
      String(includePersonalCollections),
    );
  }
  if (sortColumn != null) {
    searchParams.set("sort_column", sortColumn);
  }
  if (sortDirection != null) {
    searchParams.set("sort_direction", sortDirection);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function brokenDependencies(params?: DependencyListParams) {
  return `${dependencyDiagnostics()}/broken${dependencyListQueryString(params)}`;
}

export function unreferencedDependencies(params?: DependencyListParams) {
  return `${dependencyDiagnostics()}/unreferenced${dependencyListQueryString(params)}`;
}
