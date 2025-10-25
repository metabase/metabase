import type { DependencyEntry } from "metabase-types/api";

const BASE_URL = `/bench/dependencies`;

export function dependencyGraph(entry?: DependencyEntry) {
  return entry ? `${BASE_URL}/${entry.type}/${entry.id}` : BASE_URL;
}
