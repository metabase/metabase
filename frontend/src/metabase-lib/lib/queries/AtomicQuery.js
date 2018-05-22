import Query from "metabase-lib/lib/queries/Query";
import type Table from "metabase-lib/lib/metadata/Table";
import type { DatabaseEngine, DatabaseId } from "metabase/meta/types/Database";
import type Database from "metabase-lib/lib/metadata/Database";

/**
 * A query type for queries that are attached to a specific database table
 * and form a single MBQL / native query clause
 */
export default class AtomicQuery extends Query {
  /**
   * Tables this query could use, if the database is set
   */
  tables(): ?(Table[]) {
    return null;
  }

  databaseId(): ?DatabaseId {
    return null;
  }

  database(): ?Database {
    return null;
  }

  engine(): ?DatabaseEngine {
    return null;
  }
}
