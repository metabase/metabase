import type { ColumnSource, NativeItem, NativeStructure } from "./types";

export function nativeItemsByName(
  native: NativeStructure | null | undefined,
): Map<string, NativeItem> {
  const byName = new Map<string, NativeItem>();
  for (const item of native?.items ?? []) {
    byName.set(item.name.toLowerCase(), item);
  }
  return byName;
}

export function nativeSource(
  item: NativeItem | null,
  aggregated: boolean,
): ColumnSource {
  if (item == null || !aggregated) {
    return "native";
  }
  if (item.kind === "aggregate") {
    return "aggregation";
  }
  if (item.in_group_by) {
    return "breakout";
  }
  return "native";
}
