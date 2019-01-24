export default class BreakoutWrapper extends Array {
  constructor(breakout, index, query) {
    super(...breakout);
    this._index = index;
    this._query = query;
  }

  dimension() {
    return this._query.parseFieldReference(this);
  }

  update(breakout) {
    return this._query.updateBreakout(this._index, breakout);
  }
  remove() {
    return this._query.removeBreakout(this._index);
  }
}
