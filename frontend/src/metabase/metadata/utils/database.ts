import type { Database, DatabaseFeature } from "metabase-types/api";

export function hasDatabaseFeature(
  database: Database,
  feature: DatabaseFeature | string | null | undefined,
): boolean {
  if (!feature) {
    return true;
  }

  const set = new Set<string>(database.features);

  if (feature === "join") {
    return (
      set.has("left-join") ||
      set.has("right-join") ||
      set.has("inner-join") ||
      set.has("full-join")
    );
  }

  return set.has(feature);
}
