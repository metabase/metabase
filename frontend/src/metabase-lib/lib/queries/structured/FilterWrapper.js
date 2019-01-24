export default class FilterWrapper extends Array {
  constructor(filter, index, query) {
    super(...filter);
    this._index = index;
    this._query = query;
  }

  dimension() {
    // TODO: better way of verifying this is a field filter
    if (this[0] !== "segment") {
      return this._query.parseFieldReference(this[1]);
    }
  }

  operator() {
    // TODO: better way of verifying this is a field filter
    if (this[0] !== "segment") {
      return this.dimension()
        .field()
        .operator(this[0]);
    }
  }

  update(filter) {
    return this._query.updateFilter(this._index, filter);
  }
  remove() {
    return this._query.removeFilter(this._index);
  }
}
