import type { Database, DatabaseFeature, DatabaseId } from "metabase-types/api";

export const isDbModifiable = (
  database: { id?: DatabaseId; is_attached_dwh?: boolean } | undefined,
) => {
  return !(database?.id != null && database.is_attached_dwh);
};

export const hasFeature = (
  database: Pick<Database, "features">,
  feature: DatabaseFeature,
) => {
  return database.features?.includes(feature) ?? false;
};

export const hasActionsEnabled = (database: Pick<Database, "settings">) => {
  return Boolean(database.settings?.["database-enable-actions"]);
};

export const hasDbRoutingEnabled = (
  database: Pick<Database, "router_user_attribute">,
) => {
  return !!database.router_user_attribute;
};
