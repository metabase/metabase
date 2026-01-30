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
  group_types?: DependencyGroupType[];
  include_personal_collections?: boolean;
  sort_column?: DependencySortColumn;
  sort_direction?: DependencySortDirection;
};

function dependencyListQueryString({
  page,
  query,
  group_types,
  include_personal_collections,
  sort_column,
  sort_direction,
}: DependencyListParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (query != null) {
    searchParams.set("query", query);
  }
  if (group_types != null) {
    group_types.forEach((groupType) => {
      searchParams.append("group_types", groupType);
    });
  }
  if (include_personal_collections != null) {
    searchParams.set(
      "include_personal_collections",
      String(include_personal_collections),
    );
  }
  if (sort_column != null) {
    searchParams.set("sort_column", sort_column);
  }
  if (sort_direction != null) {
    searchParams.set("sort_direction", sort_direction);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function breakingDependencies(params?: DependencyListParams) {
  return `${dependencyDiagnostics()}/breaking${dependencyListQueryString(params)}`;
}

export function unreferencedDependencies(params?: DependencyListParams) {
  return `${dependencyDiagnostics()}/unreferenced${dependencyListQueryString(params)}`;
}
