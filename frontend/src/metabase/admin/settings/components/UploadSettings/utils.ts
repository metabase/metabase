import { hasExternalDbRoutingEnabled } from "metabase/common/utils/database";
import type { Database, SchemaName } from "metabase-types/api";

export const getDatabaseOptions = (databases: Database[]) =>
  databases.map((db) => ({
    label: hasExternalDbRoutingEnabled(db)
      ? `${db.name} (DB Routing Enabled)`
      : db.name,
    value: String(db.id),
    disabled: hasExternalDbRoutingEnabled(db),
  }));

export const getSchemaOptions = (schemas: SchemaName[]) =>
  schemas.map((schema) => ({ label: schema, value: schema }));

export const dbHasSchema = (databases: Database[], dbId: number): boolean =>
  !!databases
    .find((db: Database) => db.id === dbId)
    ?.features?.includes("schemas");
