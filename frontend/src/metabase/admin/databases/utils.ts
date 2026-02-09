import type {
  AuxiliaryConnectionType,
  Database,
  DatabaseFeature,
  DatabaseId,
} from "metabase-types/api";

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

export const hasAuxiliaryConnectionsEnabled = (
  database: Pick<Database, "write_database_id">,
  types: readonly AuxiliaryConnectionType[] = ["read-write-data"],
) => {
  return types.reduce(
    (acc, type) => acc || getAuxiliaryConnectionId(type, database) != null,
    false,
  );
};

export const getAuxiliaryConnectionId = (
  type: AuxiliaryConnectionType,
  database: Pick<Database, "write_database_id">,
) => {
  switch (type) {
    case "read-write-data":
      return database.write_database_id;
    default:
      return null;
  }
};
