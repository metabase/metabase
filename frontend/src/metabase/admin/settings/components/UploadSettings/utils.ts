import type { Schema } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

export const getDatabaseOptions = (databases: Database[]) =>
  databases
    .filter(db => db?.settings?.["database-enable-actions"])
    .map(db => ({ name: db.name, value: db.id }));

export const getSchemaOptions = (schema: Schema[]) =>
  schema.map(s => ({ name: s.name, value: s.name }));

// it would be nice if the API returned schema as a DB feature at a driver level,
// but it doesn't do this yet
const enginesWithSchema = ["postgres", "h2"];

export const dbHasSchema = (databases: Database[], dbId: number) =>
  enginesWithSchema.includes(
    databases.find((db: Database) => db.id === dbId)?.engine ?? "",
  );
