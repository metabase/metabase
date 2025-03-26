import type { Database, SchemaName } from "metabase-types/api";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map(db => ({ label: db.name, value: String(db.id) }));

export const getSchemaOptions = (schemas: SchemaName[]) =>
  schemas.map(schema => ({ label: schema, value: schema }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features?.includes("schemas");
