import {
  join,
  joins,
  metadata,
  field_metadata,
  native_query,
  order_by,
  order_bys,
  query,
  saved_question_query,
} from "cljs/metabase.lib.core";

export default class Query {
  _query;

  /// HOW DO I MAKE THIS PRIVATE!
  constructor(q) {
    this._query = q;
  }

  static fromRawQueryAndMetadata(q, metadata) {
    return new Query(query(metadata, q));
  }

  static fromSavedQuestion(card) {
    return new Query(saved_question_query(card));
  }

  metadata() {
    return metadata(this._query);
  }

  field(fieldName) {
    return field_metadata(this._query, fieldName);
  }

  orderBy(x) {
    return new Query(order_by(this._query, x));
  }

  orderBys() {
    return order_bys(this._query);
  }

  join(x, condition) {
    return new Query(join(this._query, x, condition));
  }

  joins() {
    return joins(this._query);
  }
}
