import type { DependencyEntry, DependencyGroupType } from "metabase-types/api";

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
  query?: string;
  groupTypes?: DependencyGroupType[];
  includeInDashboards?: boolean;
  includeInPersonalCollections?: boolean;
};

function dependencyListQueryString({
  query,
  groupTypes,
  includeInDashboards,
  includeInPersonalCollections,
}: DependencyListParams = {}) {
  const searchParams = new URLSearchParams();
  if (query != null) {
    searchParams.set("query", query);
  }
  if (groupTypes != null) {
    groupTypes.forEach((groupType) => {
      searchParams.append("groupTypes", groupType);
    });
  }
  if (includeInDashboards != null) {
    searchParams.set("includeInDashboards", String(includeInDashboards));
  }
  if (includeInPersonalCollections != null) {
    searchParams.set(
      "includeInPersonalCollections",
      String(includeInPersonalCollections),
    );
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
