import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Query from "metabase-lib/v1/queries/Query";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default abstract class Variable {
  _args: any[];
  _metadata: Metadata | null | undefined;
  _query: Query | null | undefined;

  constructor(args: any[], metadata?: Metadata, query?: Query) {
    this._args = args;
    this._metadata = metadata || (query && query.metadata());
    this._query = query;
  }

  abstract displayName(): string | null | undefined;
}
