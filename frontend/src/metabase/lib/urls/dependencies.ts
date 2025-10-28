import type { DependencyEntry } from "metabase-types/api";

const BASE_URL = `/admin/tools/dependencies`;

export type DependencyGraphParams = {
  entry?: DependencyEntry;
  baseUrl?: string;
};

export function dependencyGraph({
  entry,
  baseUrl = BASE_URL,
}: DependencyGraphParams = {}) {
  const params = new URLSearchParams();
  if (entry != null) {
    params.set("id", String(entry.id));
    params.set("type", entry.type);
  }
  return params.size > 0 ? `${baseUrl}?${params}` : baseUrl;
}
