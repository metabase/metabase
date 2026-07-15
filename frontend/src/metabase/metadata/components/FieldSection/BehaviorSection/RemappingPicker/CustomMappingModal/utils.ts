import type { RowValue } from "metabase-types/api";

import type { DraftMapping, Mapping } from "./types";

export function areMappingsEqual(a: Mapping, b: Mapping): boolean {
  return (
    a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)
  );
}

export function fillMissingMappings(mappings: DraftMapping): Mapping {
  // The backend requires every original value to have a mapping, so default unset labels
  // (undefined, or null from legacy data) to the original value as a string.
  return new Map(
    [...mappings].map(([original, label]): [RowValue, string] => [
      original,
      label ?? String(original),
    ]),
  );
}

export function getHasEmptyValues(mapping: Mapping): boolean {
  return Array.from(mapping.values()).some((value) => {
    return value.trim().length === 0;
  });
}
