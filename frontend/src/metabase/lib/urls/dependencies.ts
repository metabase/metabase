import type { DependencyEntry } from "metabase-types/api";

const BASE_URL = `/dependencies`;

export type DependencyGraphParams = {
  entry?: DependencyEntry;
};

export function dependencyGraph({ entry }: DependencyGraphParams) {
  return entry ? `${BASE_URL}/${entry.type}/${entry.id}` : BASE_URL;
}
