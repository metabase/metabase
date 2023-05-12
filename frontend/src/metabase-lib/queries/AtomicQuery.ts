// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { DatabaseId } from "metabase-types/api";
import Query from "metabase-lib/queries/Query";
import Table from "metabase-lib/metadata/Table";
import Database from "metabase-lib/metadata/Database";
/**
 * A query type for queries that are attached to a specific database table
 * and form a single MBQL / native query clause
 */

export default class AtomicQuery extends Query {
  /**
   * Tables this query could use, if the database is set
   */
  tables(): Table[] | null | undefined {
    return null;
  }

  databaseId(): DatabaseId | null | undefined {
    return null;
  }

  database(): Database | null | undefined {
    return null;
  }

  engine(): string | null | undefined {
    return null;
  }

  sourceTable(): Table | null | undefined {
    return null;
  }

  canNest() {
    return this.database()?.hasFeature("nested-queries");
  }
}
