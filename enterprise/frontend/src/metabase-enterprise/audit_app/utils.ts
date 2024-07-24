import type { Database } from "metabase-types/api";

const AUDIT_DB_ID = 13371337;

export const isAuditDb = (db: Database) => db.id === AUDIT_DB_ID;
