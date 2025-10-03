import type { DependencyFlowParams } from "./types";

const BASE_URL = `/dependencies`;

export function getDependencyFlowUrl({ entry }: DependencyFlowParams) {
  return entry ? `${BASE_URL}/${entry.type}/${entry.id}` : BASE_URL;
}
