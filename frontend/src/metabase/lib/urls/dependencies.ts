import type {
  DependencyEntry,
  DependencyFilterOptions,
  DependencySortingOptions,
} from "metabase-types/api";

const BASE_URL = `/data-studio`;
const GRAPH_URL = `${BASE_URL}/dependencies`;
const TASKS_URL = `${BASE_URL}/tasks`;

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

export function dependencyTasks() {
  return TASKS_URL;
}

export type DependencyListParams = {
  page?: number;
  filters?: DependencyFilterOptions;
  sorting?: DependencySortingOptions;
};

function dependencyListQueryString({
  page,
  filters,
  sorting,
}: DependencyListParams = {}) {
  const searchParams = new URLSearchParams();

  if (page != null) {
    searchParams.set("page", String(page));
  }
  if (filters != null) {
    const { query, types, cardTypes, includePersonalCollections } = filters;
    if (query != null) {
      searchParams.set("query", query);
    }
    if (types != null) {
      types.forEach((type) => {
        searchParams.append("types", type);
      });
    }
    if (cardTypes != null) {
      cardTypes.forEach((cardType) => {
        searchParams.append("card-types", cardType);
      });
    }
    if (includePersonalCollections != null) {
      searchParams.set(
        "include-personal-collections",
        String(includePersonalCollections),
      );
    }
  }
  if (sorting != null) {
    searchParams.set("sort-column", sorting.column);
    searchParams.set("sort-direction", sorting.direction);
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

export function brokenDependencies(params?: DependencyListParams) {
  return `${dependencyTasks()}/broken${dependencyListQueryString(params)}`;
}

export function unreferencedDependencies(params?: DependencyListParams) {
  return `${dependencyTasks()}/unreferenced${dependencyListQueryString(params)}`;
}
