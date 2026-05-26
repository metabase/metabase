import type { NormalizedSchema } from "metabase-types/api";

import type Database from "./Database";
import type Metadata from "./Metadata";
import type Table from "./Table";

/**
 * Schema as seen by the metadata layer — `NormalizedSchema` with `database`
 * and `tables` replaced by their hydrated counterparts.
 *
 * @deprecated use RTK Query endpoints and plain api objects from metabase-types/api
 */
export interface Schema extends Omit<NormalizedSchema, "database" | "tables"> {
  database?: Database;
  tables?: Table[];
  metadata?: Metadata;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schema;
