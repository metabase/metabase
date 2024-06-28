import type Database from "metabase-lib/v1/metadata/Database";
import type Schema from "metabase-lib/v1/metadata/Schema";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map(db => ({ name: db.name, value: db.id }));

export const getSchemaOptions = (schema: Schema[]) =>
  schema.map(s => ({ name: s.name, value: s.name }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features?.includes("schemas");
