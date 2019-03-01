export default class AggregationWrapper extends Array {
  constructor(aggregation, index, query) {
    super(...aggregation);
    this._index = index;
    this._query = query;
  }

  dimension() {
    // TODO: better way of verifying this is a field aggregatuib
    return this._query.parseFieldReference(this[1]);
  }

  update(aggregation) {
    return this._query.updateAggregation(this._index, aggregation);
  }
  remove() {
    return this._query.removeAggregation(this._index);
  }
}
