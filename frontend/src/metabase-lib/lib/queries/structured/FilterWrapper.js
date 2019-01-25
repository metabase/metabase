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

  field() {
    const dimension = this.dimension();
    return dimension && dimension.field();
  }

  operator() {
    const field = this.field();
    return field && field.operator(this[0]);
  }

  operatorOptions() {
    const field = this.field();
    return field && field.operators;
  }

  isDimension(dimensionOption) {
    const dimension = this.dimension();
    return dimension && dimension.isEqual(dimensionOption);
  }

  isOperator(operatorOption) {
    const operator = this.operator();
    const operatorName =
      typeof operatorOption === "string"
        ? operatorOption
        : operatorOption && operatorOption.name;
    return operator && operator.name === operatorName;
  }

  // modify and return parent query
  replace(filter) {
    return this._query.updateFilter(this._index, filter);
  }
  remove() {
    return this._query.removeFilter(this._index);
  }
}
