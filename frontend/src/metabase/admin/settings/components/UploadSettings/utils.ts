import Database from "metabase-lib/metadata/Database";
import Schema from "metabase-lib/metadata/Schema";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map(db => ({ name: db.name, value: db.id }));

export const getSchemaOptions = (schema: Schema[]) =>
  schema.map(s => ({ name: s.name, value: s.name }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features.includes("schemas");
