import type { Database, SchemaName } from "metabase-types/api";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map((db) => ({
    label: db.router_user_attribute
      ? `${db.name} (DB Routing Enabled)`
      : db.name,
    value: String(db.id),
    disabled: !!db.router_user_attribute,
  }));

export const getSchemaOptions = (schemas: SchemaName[]) =>
  schemas.map((schema) => ({ label: schema, value: schema }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features?.includes("schemas");
