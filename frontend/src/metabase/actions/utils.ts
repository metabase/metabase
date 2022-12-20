import type { Database as IDatabase } from "metabase-types/api";

import type Database from "metabase-lib/metadata/Database";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.["database-enable-actions"];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature("actions");
