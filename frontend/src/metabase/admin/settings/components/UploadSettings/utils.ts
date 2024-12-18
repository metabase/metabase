import type Database from "metabase-lib/v1/metadata/Database";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map(db => ({ name: db.name, value: db.id }));

export const getSchemaOptions = (schemas: string[]) =>
  schemas.map(schema => ({ name: schema, value: schema }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features?.includes("schemas");
