import type Query from "metabase-lib/queries/Query";
import type Metadata from "metabase-lib/metadata/Metadata";

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
