/* @flow */

import type StructuredQuery from "../StructuredQuery";

export default class MBQLClause extends Array {
  _index: number;
  _query: StructuredQuery;

  constructor(mbql: Array<any>, index: number, query: StructuredQuery) {
    super(...mbql);
    this._index = index;
    this._query = query;
  }

  replace(replacement: any): StructuredQuery {
    throw new Error("Abstract method `replace` not implemented");
  }

  /**
   * returns the parent query object
   */
  query(): StructuredQuery {
    return this._query;
  }

  /**
   * replaces the previous clause with this one and propagates an update, recursively
   */
  update(...args: any) {
    return this.replace(this).update(undefined, ...args);
  }

  /**
   * return the Metadata instance from the linked Query
   */
  metadata() {
    return this._query.metadata();
  }
}
