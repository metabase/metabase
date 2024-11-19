import type { Database } from "metabase-types/api";

export const isAuditDb = (db: Database) => !!db.is_audit;
