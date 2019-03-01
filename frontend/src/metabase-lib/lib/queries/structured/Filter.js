/* @flow */

import MBQLClause from "./MBQLClause";

import type { Filter as FilterObject } from "metabase/meta/types/Query";
import type StructuredQuery from "../StructuredQuery";
import type Dimension from "../../Dimension";

type FilterOperator = {
  name: string, // MBQL filter clause
};

import {
  isSegmentFilter,
  isCompoundFilter,
  isFieldFilter,
} from "metabase/lib/query/filter";

export default class Filter extends MBQLClause {
  /**
   * Replaces the aggregation in the parent query and returns the new StructuredQuery
   */
  replace(filter: Filter | FilterObject): StructuredQuery {
    return this._query.updateFilter(this._index, filter);
  }

  /**
   * Removes the aggregation in the parent query and returns the new StructuredQuery
   */
  remove(): StructuredQuery {
    return this._query.removeFilter(this._index);
  }

  dimension(): ?Dimension {
    if (this.isFieldFilter()) {
      return this._query.parseFieldReference(this[1]);
    }
  }

  field() {
    const dimension = this.dimension();
    return dimension && dimension.field();
  }

  operator(): ?FilterOperator {
    const field = this.field();
    return field ? field.operator(this[0]) : null;
  }

  operatorOptions(): ?(FilterOperator[]) {
    const field = this.field();
    return field ? field.operators : null;
  }

  isDimension(otherDimension: Dimension): boolean {
    const dimension = this.dimension();
    return dimension ? dimension.isEqual(otherDimension) : false;
  }

  isOperator(otherOperator: FilterOperator | string) {
    const operator = this.operator();
    const operatorName =
      typeof otherOperator === "string"
        ? otherOperator
        : otherOperator && otherOperator.name;
    return operator && operator.name === operatorName;
  }

  isSegmentFilter() {
    return isSegmentFilter(this);
  }

  isCompoundFilter() {
    return isCompoundFilter(this);
  }

  isFieldFilter() {
    return isFieldFilter(this);
  }
}
