import type { DependencyLineageParams } from "./types";

const BASE_URL = `/dependencies`;

export function getDependencyLineageUrl({ entry }: DependencyLineageParams) {
  return entry ? `${BASE_URL}/${entry.type}/${entry.id}` : BASE_URL;
}
