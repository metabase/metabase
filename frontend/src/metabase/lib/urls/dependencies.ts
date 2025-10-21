import type { DependencyEntry } from "metabase-types/api";

const BASE_URL = `/dependencies`;

export type DependencyLineageParams = {
  entry?: DependencyEntry;
};

export function dependencyLineage({ entry }: DependencyLineageParams) {
  return entry ? `${BASE_URL}/${entry.type}/${entry.id}` : BASE_URL;
}
