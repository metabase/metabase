import Metadata from "metabase-lib/metadata/Metadata";
import Query from "metabase-lib/queries/Query";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Variable {
  _args: any[];
  _metadata: Metadata | null | undefined;
  _query: Query | null | undefined;

  constructor(args: any[], metadata?: Metadata, query?: Query) {
    this._args = args;
    this._metadata = metadata || (query && query.metadata());
    this._query = query;
  }
}
