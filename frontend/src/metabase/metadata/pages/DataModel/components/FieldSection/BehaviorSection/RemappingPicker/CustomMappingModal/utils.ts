import type { Mapping } from "./types";

export function areMappingsEqual(a: Mapping, b: Mapping): boolean {
  return (
    a.size === b.size && [...a].every(([key, value]) => b.get(key) === value)
  );
}

export function fillMissingMappings(mappings: Mapping): Mapping {
  const remappings = new Map(
    [...mappings].map(([original, mappedOrUndefined]) => {
      // Use currently the original value as the "default custom mapping" as the current backend implementation
      // requires that all original values must have corresponding mappings

      // Additionally, the defensive `.toString` ensures that the mapped value definitely will be string
      const mappedString =
        mappedOrUndefined !== undefined
          ? mappedOrUndefined.toString()
          : original === null
            ? "null"
            : original.toString();

      return [original, mappedString];
    }),
  );

  return remappings;
}

export function getHasEmptyValues(mapping: Mapping): boolean {
  return Array.from(mapping.values()).some((value) => {
    return value.trim().length === 0;
  });
}
