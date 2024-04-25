// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import Query from "metabase-lib/v1/queries/Query";
import type { DatabaseId } from "metabase-types/api";
/**
 * A query type for queries that are attached to a specific database table
 * and form a single MBQL / native query clause
 */

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class AtomicQuery extends Query {
  /**
   * Tables this query could use, if the database is set
   */
  tables(): Table[] | null | undefined {
    return null;
  }

  /**
   * @deprecated Use MLv2
   */
  _databaseId(): DatabaseId | null | undefined {
    return null;
  }

  /**
   * @deprecated Use MLv2
   */
  _database(): Database | null | undefined {
    return null;
  }

  engine(): string | null | undefined {
    return null;
  }
}
