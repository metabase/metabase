import type { Database, DatabaseFeature } from "metabase-types/api";

export const hasFeature = (
  database: Pick<Database, "features">,
  feature: DatabaseFeature,
) => {
  return database.features?.includes(feature) ?? false;
};

/**
 * The v1 `Database.hasFeature` treated "join" as any join type. It is not a
 * `DatabaseFeature` of its own, so it needs naming here.
 */
const JOIN_FEATURES: DatabaseFeature[] = [
  "left-join",
  "right-join",
  "inner-join",
  "full-join",
];

export const supportsJoins = (database: Pick<Database, "features">) =>
  JOIN_FEATURES.some((feature) => hasFeature(database, feature));

/**
 * For features that are optional on the thing requiring them, such as an
 * expression clause with no `requiresFeature`. No requirement means supported.
 */
export const hasRequiredFeature = (
  database: Pick<Database, "features">,
  feature: DatabaseFeature | null | undefined,
) => feature == null || hasFeature(database, feature);
